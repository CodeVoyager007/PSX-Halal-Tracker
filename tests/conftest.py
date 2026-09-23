import os
import sys
from pathlib import Path

# Tests run offline and must never reach the real database: force dummy
# credentials (load_dotenv in common.py does not override set variables).
os.environ["SUPABASE_URL"] = "https://example.supabase.co"
os.environ["SUPABASE_KEY"] = "test-key"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
