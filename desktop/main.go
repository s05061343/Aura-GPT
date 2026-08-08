//go:build windows

package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"fyne.io/systray"
	"golang.org/x/sys/windows"
)

const (
	webAddress     = "127.0.0.1:3000"
	backendAddress = "127.0.0.1:8000"
	webURL         = "http://127.0.0.1:3000"
)

//go:embed all:web
var webAssets embed.FS

//go:embed assets/junyx.ico
var trayIcon []byte

type manifest struct {
	LlamaCpp struct {
		DefaultBackend  string `json:"defaultBackend"`
		FallbackBackend string `json:"fallbackBackend"`
	} `json:"llamaCpp"`
	Model struct {
		File string `json:"file"`
	} `json:"model"`
}

type supervisor struct {
	mu       sync.Mutex
	root     string
	logs     string
	job      windows.Handle
	children []*exec.Cmd
	server   *http.Server
	status   *systray.MenuItem
	cancel   context.CancelFunc
	token    string
}

func main() {
	root, err := findRoot()
	if err != nil {
		fatalDialog(err)
		return
	}
	if err := readDotEnv(filepath.Join(root, ".env")); err != nil {
		fatalDialog(err)
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "stop" {
		if err := requestStop(root); err != nil {
			fatalDialog(err)
		}
		return
	}
	s, err := newSupervisor(root)
	if err != nil {
		fatalDialog(err)
		return
	}
	if running, err := probeExisting(); running {
		openBrowser(webURL)
		return
	} else if err != nil {
		fatalDialog(err)
		return
	}
	systray.Run(s.onReady, s.onExit)
}

func newSupervisor(root string) (*supervisor, error) {
	logs := filepath.Join(root, "logs")
	if err := os.MkdirAll(logs, 0o755); err != nil {
		return nil, err
	}
	logFile, err := os.OpenFile(filepath.Join(logs, "junyx.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	log.SetOutput(logFile)
	job, err := createKillOnCloseJob()
	if err != nil {
		return nil, fmt.Errorf("建立 Windows Job Object 失敗: %w", err)
	}
	return &supervisor{root: root, logs: logs, job: job}, nil
}

func (s *supervisor) onReady() {
	systray.SetTitle("JUNYX")
	systray.SetTooltip("JUNYX 正在啟動")
	systray.SetIcon(trayIcon)
	s.status = systray.AddMenuItem("狀態：正在啟動", "目前服務狀態")
	s.status.Disable()
	systray.AddSeparator()
	open := systray.AddMenuItem("開啟 JUNYX", "在瀏覽器開啟 JUNYX")
	restart := systray.AddMenuItem("重新啟動服務", "重新啟動模型與 Agent 後端")
	logs := systray.AddMenuItem("檢視記錄", "開啟 JUNYX 記錄資料夾")
	systray.AddSeparator()
	quit := systray.AddMenuItem("結束 JUNYX", "停止所有服務並結束")

	go func() {
		if err := s.start(); err != nil {
			log.Printf("startup failed: %v", err)
			s.setStatus("狀態：啟動失敗", "JUNYX 啟動失敗，請檢視記錄")
			return
		}
		s.setStatus("狀態：已就緒", "JUNYX 已就緒")
		openBrowser(webURL)
	}()
	go func() {
		for {
			select {
			case <-open.ClickedCh:
				openBrowser(webURL)
			case <-restart.ClickedCh:
				s.setStatus("狀態：重新啟動中", "JUNYX 正在重新啟動")
				if err := s.restart(); err != nil {
					log.Printf("restart failed: %v", err)
					s.setStatus("狀態：重新啟動失敗", "請檢視記錄")
				} else {
					s.setStatus("狀態：已就緒", "JUNYX 已就緒")
				}
			case <-logs.ClickedCh:
				openPath(s.logs)
			case <-quit.ClickedCh:
				systray.Quit()
				return
			}
		}
	}()
}

func (s *supervisor) onExit() { s.stop() }

func (s *supervisor) setStatus(title, tooltip string) {
	if s.status != nil {
		s.status.SetTitle(title)
	}
	systray.SetTooltip(tooltip)
}

func (s *supervisor) start() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	ctx, cancel := context.WithCancel(context.Background())
	s.cancel = cancel
	if err := s.startLlama(ctx); err != nil {
		cancel()
		return err
	}
	if err := s.startBackend(ctx); err != nil {
		s.stopChildrenLocked()
		cancel()
		return err
	}
	if err := s.startWeb(); err != nil {
		s.stopChildrenLocked()
		cancel()
		return err
	}
	return nil
}

func (s *supervisor) restart() error {
	s.stop()
	job, err := createKillOnCloseJob()
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.job = job
	s.mu.Unlock()
	return s.start()
}

func (s *supervisor) stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cancel != nil {
		s.cancel()
		s.cancel = nil
	}
	if s.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		_ = s.server.Shutdown(ctx)
		cancel()
		s.server = nil
	}
	s.stopChildrenLocked()
}

func (s *supervisor) stopChildrenLocked() {
	for i := len(s.children) - 1; i >= 0; i-- {
		cmd := s.children[i]
		if cmd.Process != nil {
			_ = cmd.Process.Signal(os.Interrupt)
		}
	}
	time.Sleep(500 * time.Millisecond)
	if s.job != 0 {
		_ = windows.CloseHandle(s.job)
		s.job = 0
	}
	s.children = nil
	_ = os.Remove(filepath.Join(s.root, ".runtime", "control-token"))
}

func (s *supervisor) startLlama(ctx context.Context) error {
	data, err := os.ReadFile(filepath.Join(s.root, "runtime-manifest.json"))
	if err != nil {
		return err
	}
	var m manifest
	if err := json.Unmarshal(data, &m); err != nil {
		return err
	}
	modelPath := envOr("LLM_MODEL_PATH", filepath.Join("models", m.Model.File))
	if !filepath.IsAbs(modelPath) {
		modelPath = filepath.Join(s.root, modelPath)
	}
	if !fileExists(modelPath) {
		return fmt.Errorf("找不到模型檔: %s", modelPath)
	}
	requested := strings.ToLower(envOr("LLM_BACKEND", "auto"))
	backends := []string{requested}
	if requested == "auto" {
		backends = []string{m.LlamaCpp.DefaultBackend, m.LlamaCpp.FallbackBackend}
	}
	var failures []string
	for _, backend := range backends {
		if backend == "hip" {
			enableROCmRuntime()
		}
		server, err := findFile(filepath.Join(s.root, ".runtime", "llama.cpp", backend), "llama-server.exe")
		if err != nil {
			failures = append(failures, backend+": missing")
			continue
		}
		device, err := detectDevice(server, backend)
		if err != nil {
			failures = append(failures, backend+": "+err.Error())
			continue
		}
		args := []string{"-m", modelPath, "--host", "127.0.0.1", "--port", envOr("LLM_SERVER_PORT", "8080"),
			"-c", envOr("LLM_CONTEXT_SIZE", "8192"), "--n-gpu-layers", envOr("LLM_GPU_LAYERS", "99"),
			"--cache-ram", envOr("LLM_CACHE_RAM_MB", "0"), "--alias", envOr("LLM_MODEL_ALIAS", "junyx-local"),
			"--jinja", "-np", "1", "--device", device}
		cmd, err := s.startProcess(ctx, server, args, "llama-"+backend)
		if err != nil {
			failures = append(failures, backend+": "+err.Error())
			continue
		}
		if err := waitReady(ctx, "http://127.0.0.1:"+envOr("LLM_SERVER_PORT", "8080")+"/health", cmd, 180*time.Second); err == nil {
			return nil
		} else {
			_ = cmd.Process.Kill()
			failures = append(failures, backend+": "+err.Error())
		}
	}
	return fmt.Errorf("沒有可用的 llama.cpp backend (%s)", strings.Join(failures, "; "))
}

func (s *supervisor) startBackend(ctx context.Context) error {
	python, err := findPython(s.root)
	if err != nil {
		return err
	}
	bootstrap := "import runpy,sys;sys.path.insert(0,sys.argv[1]);runpy.run_module('junyx_backend',run_name='__main__')"
	cmd, err := s.startProcess(ctx, python, []string{"-c", bootstrap, filepath.Join(s.root, "backend")}, "backend")
	if err != nil {
		return err
	}
	return waitReady(ctx, "http://"+backendAddress+"/api/status", cmd, 60*time.Second)
}

func (s *supervisor) startProcess(ctx context.Context, executable string, args []string, logName string) (*exec.Cmd, error) {
	out, err := os.OpenFile(filepath.Join(s.logs, logName+".out.log"), os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	errFile, err := os.OpenFile(filepath.Join(s.logs, logName+".err.log"), os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		_ = out.Close()
		return nil, err
	}
	cmd := exec.CommandContext(ctx, executable, args...)
	cmd.Dir = s.root
	cmd.Stdout, cmd.Stderr = out, errFile
	cmd.Env = append(os.Environ(), "PYTHONPATH="+filepath.Join(s.root, "backend"))
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_SUSPENDED}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	processHandle, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE|windows.PROCESS_QUERY_INFORMATION|windows.PROCESS_SUSPEND_RESUME, false, uint32(cmd.Process.Pid))
	if err != nil {
		_ = cmd.Process.Kill()
		return nil, fmt.Errorf("開啟子程序 handle 失敗: %w", err)
	}
	defer windows.CloseHandle(processHandle)
	if err := windows.AssignProcessToJobObject(s.job, processHandle); err != nil {
		_ = cmd.Process.Kill()
		return nil, fmt.Errorf("將程序加入 Job Object 失敗: %w", err)
	}
	_, _, _ = procNtResumeProcess.Call(uintptr(processHandle))
	s.children = append(s.children, cmd)
	go func() { _ = cmd.Wait(); _ = out.Close(); _ = errFile.Close() }()
	return cmd, nil
}

func (s *supervisor) startWeb() error {
	target, _ := url.Parse("http://" + backendAddress)
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, _ error) { http.Error(w, "JUNYX backend unavailable", http.StatusBadGateway) }
	assets, err := fs.Sub(webAssets, "web")
	if err != nil {
		return err
	}
	static := http.FileServer(http.FS(assets))
	indexHTML, err := fs.ReadFile(assets, "index.html")
	if err != nil {
		return fmt.Errorf("讀取內嵌 UI 首頁失敗: %w", err)
	}
	mux := http.NewServeMux()
	mux.Handle("/api/", proxy)
	mux.HandleFunc("/__junyx/control/stop", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.Header.Get("X-Junyx-Token") != s.token {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		go systray.Quit()
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(indexHTML)
			return
		}
		static.ServeHTTP(w, r)
	})
	tokenBytes := make([]byte, 32)
	_, _ = rand.Read(tokenBytes)
	s.token = hex.EncodeToString(tokenBytes)
	if err := os.MkdirAll(filepath.Join(s.root, ".runtime"), 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(s.root, ".runtime", "control-token"), []byte(s.token), 0o600); err != nil {
		return err
	}
	s.server = &http.Server{Addr: webAddress, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	listener, err := netListen("tcp", webAddress)
	if err != nil {
		return err
	}
	go func() {
		if err := s.server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("web server failed: %v", err)
		}
	}()
	return nil
}

var (
	ntdll               = windows.NewLazySystemDLL("ntdll.dll")
	procNtResumeProcess = ntdll.NewProc("NtResumeProcess")
	netListen           = func(network, address string) (net.Listener, error) { return net.Listen(network, address) }
)

func createKillOnCloseJob() (windows.Handle, error) {
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return 0, err
	}
	info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	info.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
	_, err = windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info)))
	if err != nil {
		_ = windows.CloseHandle(job)
		return 0, err
	}
	return job, nil
}

func waitReady(ctx context.Context, endpoint string, cmd *exec.Cmd, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	client := &http.Client{Timeout: 2 * time.Second}
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		if cmd.ProcessState != nil && cmd.ProcessState.Exited() {
			return fmt.Errorf("程序在就緒前結束")
		}
		response, err := client.Get(endpoint)
		if err == nil {
			_ = response.Body.Close()
			if response.StatusCode >= 200 && response.StatusCode < 500 {
				return nil
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("等待服務逾時: %s", endpoint)
}

func detectDevice(server, backend string) (string, error) {
	cmd := exec.Command(server, "--list-devices")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", err
	}
	prefix := "ROCm"
	if backend == "vulkan" {
		prefix = "Vulkan"
	}
	for _, line := range strings.Split(string(output), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, prefix) && strings.Contains(line, ":") {
			return strings.SplitN(line, ":", 2)[0], nil
		}
	}
	return "", fmt.Errorf("未偵測到 %s GPU", backend)
}

func findRoot() (string, error) {
	candidates := []string{}
	if executable, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Dir(executable))
	}
	if cwd, err := os.Getwd(); err == nil {
		candidates = append(candidates, cwd, filepath.Dir(cwd))
	}
	for _, candidate := range candidates {
		if fileExists(filepath.Join(candidate, "runtime-manifest.json")) {
			return filepath.Abs(candidate)
		}
	}
	return "", fmt.Errorf("找不到 JUNYX runtime-manifest.json")
}

func findPython(root string) (string, error) {
	candidates := []string{os.Getenv("JUNYX_PYTHON"), filepath.Join(root, ".runtime", "python", "python.exe"), filepath.Join(root, ".runtime", "toolchains", "python", "python.exe"), filepath.Join(root, ".venv", "Scripts", "python.exe")}
	if path, err := exec.LookPath("python.exe"); err == nil {
		candidates = append(candidates, path)
	}
	for _, candidate := range candidates {
		if candidate != "" && fileExists(candidate) {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("找不到 JUNYX Python runtime；請先執行建置/安裝程序")
}

func findFile(root, name string) (string, error) {
	var found string
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !entry.IsDir() && strings.EqualFold(entry.Name(), name) {
			found = path
			return io.EOF
		}
		return nil
	})
	if found != "" {
		return found, nil
	}
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	return "", os.ErrNotExist
}

func probeExisting() (bool, error) {
	client := &http.Client{Timeout: time.Second}
	response, err := client.Get(webURL + "/api/status")
	if err != nil {
		return false, nil
	}
	defer response.Body.Close()
	var payload struct{ Application string `json:"application"` }
	if response.StatusCode == http.StatusOK && json.NewDecoder(response.Body).Decode(&payload) == nil && payload.Application == "ready" {
		return true, nil
	}
	return false, fmt.Errorf("連接埠 3000 已被其他服務占用")
}

func requestStop(root string) error {
	token, err := os.ReadFile(filepath.Join(root, ".runtime", "control-token"))
	if err != nil {
		return fmt.Errorf("JUNYX 未執行")
	}
	request, _ := http.NewRequest(http.MethodPost, webURL+"/__junyx/control/stop", nil)
	request.Header.Set("X-Junyx-Token", strings.TrimSpace(string(token)))
	response, err := (&http.Client{Timeout: 3 * time.Second}).Do(request)
	if err != nil {
		return fmt.Errorf("無法停止 JUNYX: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		return fmt.Errorf("JUNYX 拒絕停止請求")
	}
	return nil
}

func envOr(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func readDotEnv(path string) error {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		name, value, ok := strings.Cut(line, "=")
		name = strings.TrimSpace(name)
		if !ok || name == "" || strings.ContainsAny(name, " \t\r\n") {
			continue
		}
		if _, exists := os.LookupEnv(name); exists {
			continue
		}
		value = strings.Trim(strings.TrimSpace(value), "\"'")
		if err := os.Setenv(name, value); err != nil {
			return err
		}
	}
	return nil
}

func enableROCmRuntime() {
	candidates := []string{}
	if root := strings.TrimSpace(os.Getenv("ROCM_PATH")); root != "" {
		candidates = append(candidates, filepath.Join(root, "bin"))
	}
	if programFiles := strings.TrimSpace(os.Getenv("ProgramFiles")); programFiles != "" {
		matches, _ := filepath.Glob(filepath.Join(programFiles, "AMD", "ROCm", "*", "bin"))
		sort.Sort(sort.Reverse(sort.StringSlice(matches)))
		candidates = append(candidates, matches...)
	}
	for _, candidate := range candidates {
		if fileExists(filepath.Join(candidate, "amdhip64_7.dll")) {
			path := os.Getenv("PATH")
			if !strings.Contains(strings.ToLower(path), strings.ToLower(candidate)) {
				_ = os.Setenv("PATH", candidate+string(os.PathListSeparator)+path)
			}
			return
		}
	}
}

func fileExists(path string) bool { info, err := os.Stat(path); return err == nil && !info.IsDir() }

func openBrowser(target string) { _ = hiddenCommand("rundll32.exe", "url.dll,FileProtocolHandler", target).Start() }
func openPath(target string)    { _ = hiddenCommand("explorer.exe", target).Start() }
func hiddenCommand(name string, args ...string) *exec.Cmd {
	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return cmd
}
func fatalDialog(err error) {
	log.Printf("fatal: %v", err)
	_ = hiddenCommand("msg.exe", "*", "JUNYX 啟動失敗："+err.Error()).Run()
}
