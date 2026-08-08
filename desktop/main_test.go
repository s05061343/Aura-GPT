//go:build windows

package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEnvOr(t *testing.T) {
	t.Setenv("JUNYX_TEST_VALUE", "configured")
	if got := envOr("JUNYX_TEST_VALUE", "fallback"); got != "configured" {
		t.Fatalf("envOr() = %q", got)
	}
	t.Setenv("JUNYX_TEST_VALUE", "  ")
	if got := envOr("JUNYX_TEST_VALUE", "fallback"); got != "fallback" {
		t.Fatalf("envOr() fallback = %q", got)
	}
}

func TestFindFile(t *testing.T) {
	root := t.TempDir()
	nested := filepath.Join(root, "nested")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(nested, "llama-server.exe")
	if err := os.WriteFile(want, []byte("test"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := findFile(root, "llama-server.exe")
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("findFile() = %q, want %q", got, want)
	}
}

func TestReadDotEnvDoesNotOverrideProcessEnvironment(t *testing.T) {
	t.Setenv("JUNYX_EXISTING", "process")
	path := filepath.Join(t.TempDir(), ".env")
	content := "# comment\nJUNYX_EXISTING=file\nJUNYX_NEW='loaded'\n"
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := readDotEnv(path); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("JUNYX_EXISTING"); got != "process" {
		t.Fatalf("existing environment overridden: %q", got)
	}
	if got := os.Getenv("JUNYX_NEW"); got != "loaded" {
		t.Fatalf("new environment not loaded: %q", got)
	}
	t.Cleanup(func() { _ = os.Unsetenv("JUNYX_NEW") })
}
