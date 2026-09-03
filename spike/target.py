# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""A contract with one readable flag, for finding out whether another contract
can read it. Nothing here is the product; this exists to answer one question
before any of the product is designed around the answer."""

from genlayer import *
import json


class Target(gl.Contract):
    flag: str

    def __init__(self) -> None:
        self.flag = "OPEN"

    @gl.public.write
    def set_flag(self, value: str) -> str:
        self.flag = str(value).strip().upper()[:20]
        return json.dumps({"ok": True, "flag": self.flag})

    @gl.public.view
    def state(self) -> str:
        return self.flag
