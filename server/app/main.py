from fastapi import FastAPI

app = FastAPI(title="Wallboard")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
