from prelegal_backend import config
from prelegal_backend.config import Settings


def test_reads_the_api_key_from_the_environment(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "REPO_ROOT", tmp_path)
    monkeypatch.setenv("OPENROUTER_API_KEY", "from-env")
    assert Settings.from_env().openrouter_api_key == "from-env"


def test_loads_the_repo_env_file_without_overriding_the_environment(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "REPO_ROOT", tmp_path)
    (tmp_path / ".env").write_text("OPENROUTER_API_KEY=from-file\n")

    monkeypatch.setenv("OPENROUTER_API_KEY", "from-env")
    assert Settings.from_env().openrouter_api_key == "from-env"

    monkeypatch.delenv("OPENROUTER_API_KEY")
    assert Settings.from_env().openrouter_api_key == "from-file"


def test_blank_api_key_means_unset(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "REPO_ROOT", tmp_path)
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    assert Settings.from_env().openrouter_api_key is None
