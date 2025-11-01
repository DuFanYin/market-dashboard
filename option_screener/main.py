"""FastAPI backend for option chain inspector."""
from pathlib import Path
import json

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.templating import Jinja2Templates

app = FastAPI(title="Option Chain Inspector")

# Setup templates and static files
BASE_DIR = Path(__file__).parent
templates = Jinja2Templates(directory=str(BASE_DIR / "src" / "templates"))
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "src" / "static")), name="static")


# Data directory
DATA_DIR = BASE_DIR / "data"


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """Serve the main inspector page."""
    return templates.TemplateResponse("inspect.html", {"request": request})


@app.get("/api/files")
async def list_files():
    """
    List all available JSON files in the data directory.
    
    Returns:
        List of available JSON filenames
    """
    if not DATA_DIR.exists():
        return JSONResponse(content=[])
    
    json_files = sorted([f.name for f in DATA_DIR.glob("*.json")])
    return JSONResponse(content=json_files)


@app.get("/api/data")
async def get_data(filename: str):
    """
    Load JSON data file.
    
    Args:
        filename: Name of the JSON file to load
    
    Returns:
        JSON data from the file
    """
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required")
    
    file_path = DATA_DIR / filename
    
    # Security check: ensure file is in data directory and is a JSON file
    if not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="File must be a JSON file")
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {filename}")
    
    # Ensure the resolved path is still within DATA_DIR
    try:
        file_path.resolve().relative_to(DATA_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        with open(file_path, "r") as f:
            data = json.load(f)
        return JSONResponse(content=data)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

