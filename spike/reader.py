# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""Can one GenLayer contract read another one's state?

Everything a halt module would do rests on this, so it is answered on its own
before anything is built on top of the answer.

The first attempt used `@gl.evm.contract_interface`, which is for EVM contracts
and, on Studio, is not implemented beyond value transfers. Reading another
Intelligent Contract goes through `gl.get_contract_at(...).view()`, which is
synchronous and reads the target's state as of the current block.
"""

from genlayer import *
import json


@gl.contract_interface
class _Target:
    class View:
        def state(self) -> str: ...

    class Write:
        pass


class Reader(gl.Contract):
    seen: DynArray[str]

    def __init__(self) -> None:
        pass

    @gl.public.write
    def read_typed(self, address: str) -> str:
        """The statically typed way, through an interface class."""
        try:
            value = str(_Target(Address(str(address).strip())).view().state())
            self.seen.append(value)
            return json.dumps({"ok": True, "how": "interface", "read": value})
        except Exception as error:
            return json.dumps({"ok": False, "how": "interface", "error": str(error)[:200]})

    @gl.public.write
    def read_dynamic(self, address: str) -> str:
        """The dynamically typed way, with no interface declared."""
        try:
            value = str(gl.get_contract_at(Address(str(address).strip())).view().state())
            self.seen.append(value)
            return json.dumps({"ok": True, "how": "dynamic", "read": value})
        except Exception as error:
            return json.dumps({"ok": False, "how": "dynamic", "error": str(error)[:200]})

    @gl.public.view
    def last(self) -> str:
        return self.seen[len(self.seen) - 1] if len(self.seen) else ""
