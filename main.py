from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

app = FastAPI()

# Frontend qovluğunu "statik fayl" kimi təqdim et
app.mount("/static", StaticFiles(directory="./static/"), name="static")

# Root URL frontendin index.html faylını göstərsin
@app.get("/")
async def read_index():
    return FileResponse("./static/index.html")

