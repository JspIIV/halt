# v0.3.0
# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import genlayer as gl


class ProbeB(gl.contract.Contract):
    owner: str
    ledger: gl.DynArray[str]

    def __init__(self, owner: str) -> None:
        self.owner = owner

    @gl.public.view
    def size(self) -> str:
        return str(len(self.ledger))
