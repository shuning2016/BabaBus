import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Tests always run against the demo datasource, even when the developer's
# .env carries a real LTA key (env vars take priority over the dotenv file).
os.environ["LTA_ACCOUNT_KEY"] = ""
