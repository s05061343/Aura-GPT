import uvicorn


if __name__ == "__main__":
    uvicorn.run("junyx_backend.app:app", host="127.0.0.1", port=8000, log_config=None, access_log=False)
