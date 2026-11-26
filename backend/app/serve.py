"""Container entrypoint: print the app URL, then start uvicorn."""
from __future__ import annotations

import logging
import os

import uvicorn

from .config import get_settings
from .main import create_app


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    settings = get_settings()
    app = create_app(settings)
    public_port = os.getenv("PUBLIC_PORT", str(settings.port))
    mode = "No-key mode: browser speech recognition (needs internet) + extraction/rules on this server" \
        if not (settings.sarvam_enabled or settings.gemini_enabled) \
        else f"key mode: sarvam={settings.sarvam_enabled}, gemini={settings.gemini_enabled}"
    banner = "=" * 60
    print(f"\n{banner}\n  ASHA Saathi is running → open  http://localhost:{public_port}\n  {mode}\n{banner}\n",
          flush=True)
    uvicorn.run(app, host="0.0.0.0", port=settings.port, log_level="info")


if __name__ == "__main__":
    main()
