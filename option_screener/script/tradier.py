import sys
import time
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional
from threading import Thread, Lock

import requests
from os import getenv
from dotenv import load_dotenv, find_dotenv


# Load environment variables
_ = load_dotenv(find_dotenv())
load_dotenv()


# Tradier API constants
DEFAULT_TRADIER_BASE_URL = "https://api.tradier.com/v1/"
TRADIER_BASE_URL = getenv("TRADIER_BASE_URL", DEFAULT_TRADIER_BASE_URL).rstrip("/") + "/"
TRADIER_TOKEN = getenv("TRADIER_TOKEN")

if not TRADIER_TOKEN:
    raise SystemExit("TRADIER_TOKEN is not set in environment. Please export it or add to .env")

TRADIER_HEADERS = {
    "Authorization": f"Bearer {TRADIER_TOKEN}",
    "Accept": "application/json",
}


def http_get(path: str, params: Optional[Dict] = None, retry: int = 3, backoff_sec: float = 1.0) -> Dict:
    url = f"{TRADIER_BASE_URL}{path.lstrip('/')}"
    last_err: Optional[Exception] = None
    for attempt in range(retry):
        try:
            resp = requests.get(url, headers=TRADIER_HEADERS, params=params, timeout=30)
            # Handle rate limit status explicitly if present
            if resp.status_code == 429:
                # Respect Retry-After header if provided
                retry_after = float(resp.headers.get("Retry-After", backoff_sec * (2 ** attempt)))
                time.sleep(retry_after)
                continue
            resp.raise_for_status()
            try:
                parsed = resp.json() if resp.content else {}
            except Exception:
                parsed = {}
            return parsed or {}
        except Exception as err:  # noqa: BLE001
            last_err = err
            time.sleep(backoff_sec * (2 ** attempt))
    raise RuntimeError(f"GET {url} failed after {retry} attempts: {last_err}")


def get_expirations(symbol: str, include_all_roots: bool = True, strikes: bool = False) -> List[str]:
    params = {
        "symbol": symbol.upper(),
        "includeAllRoots": str(include_all_roots).lower(),
        "strikes": str(strikes).lower(),
    }
    data = http_get("markets/options/expirations", params)
    # Expected shape: { "expirations": { "date": ["2025-10-31", ...] } }
    exp_node = (data or {}).get("expirations") or {}
    dates = exp_node.get("date", [])
    # Tradier returns a single string if only one date
    if isinstance(dates, str):
        out = [dates]
    else:
        out = list(dates)
    print(f"expirations: {symbol} -> {len(out)} dates")
    return out


def get_chain_for_expiration(symbol: str, expiration: str, greeks: bool = True) -> List[Dict]:
    params = {
        "symbol": symbol.upper(),
        "expiration": expiration,
        "greeks": str(greeks).lower(),
    }
    data = http_get("markets/options/chains", params)
    # Expected shape: { "options": { "option": [ {...}, {...} ] } }
    opt_node = (data or {}).get("options") or {}
    options = opt_node.get("option", [])
    if isinstance(options, dict):
        out = [options]
    elif options is None:
        out = []
    else:
        out = list(options)
    print(f"chain: {symbol} {expiration} -> {len(out)} contracts")
    return out


def iter_all_chains_grouped(symbol: str, delay_sec: float = 0.2) -> Dict[str, List[Dict]]:
    expirations = get_expirations(symbol)
    total = len(expirations)
    result: Dict[str, List[Dict]] = {}
    result_lock = Lock()
    request_lock = Lock()
    last_request_time = [0.0]  # Use list to allow modification in nested function
    
    # Ensure 1 request per second globally
    request_delay = 1.0
    
    def fetch_expiration(exp: str, idx: int) -> None:
        """Fetch chain for a single expiration and store result."""
        # Ensure 1 request per second globally
        with request_lock:
            now = time.time()
            elapsed = now - last_request_time[0]
            if elapsed < request_delay:
                time.sleep(request_delay - elapsed)
            last_request_time[0] = time.time()
        
        print(f"progress: {symbol} {idx}/{total} {exp}")
        try:
            rows = get_chain_for_expiration(symbol, exp, greeks=True)
            if rows:
                with result_lock:
                    result[exp] = rows
        except Exception as exc:
            print(f"expiration {exp} generated an exception: {exc}")
    
    # Create 4 threads
    num_threads = 8
    threads = []
    expiration_queue = list(enumerate(expirations, start=1))
    queue_lock = Lock()
    
    def worker_thread():
        """Worker thread that processes expirations from the queue."""
        while True:
            with queue_lock:
                if not expiration_queue:
                    break
                idx, exp = expiration_queue.pop(0)
            fetch_expiration(exp, idx)
    
    # Start 4 threads
    for _ in range(num_threads):
        thread = Thread(target=worker_thread)
        thread.start()
        threads.append(thread)
    
    # Wait for all threads to complete
    for thread in threads:
        thread.join()
    
    return result


def write_json(data: Dict, out_path: Optional[Path]) -> None:
    if out_path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(data, indent=2))
        print(f"output: wrote {out_path}")
    else:
        print("output: stdout JSON below")
        print(json.dumps(data, indent=2))


def normalize_symbol_param(symbol: str) -> str:
    s = (symbol or "").strip().upper().replace(" ", "")
    return s


def main(symbol: str = "PLTR", output: Optional[str] = None, delay: float = 0.2, stdout: bool = False) -> int:
    print(f"start: symbol={symbol} delay={delay} output={'stdout' if stdout else output}")
    symbol = normalize_symbol_param(symbol)
    
    # Use relative path - script is in forward/script/, data is in forward/data/
    if stdout:
        out_path = None
    elif output:
        # If output is provided, resolve it relative to forward/ directory
        out_path = Path(__file__).parent.parent / output
    else:
        # Default to data directory
        out_path = Path(__file__).parent.parent / "data" / f"{symbol.lower()}.json"

    grouped = iter_all_chains_grouped(symbol, delay_sec=delay)

    out_json = {
        "symbols": [symbol],
        "timestamp": datetime.now(timezone.utc).timestamp(),
        "chains": {
            symbol: grouped     # <--- grouped by expiration
        }
    }

    write_json(out_json, out_path)
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
