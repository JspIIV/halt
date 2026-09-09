"""Port a contract from the executor v0.2 API to v0.3, which Studio Next runs.

    python scripts/port_to_v03.py contracts/vault.py contracts/next/vault.py

The reviewers asked for submissions to be on Studio Next. That turned out not to
be an address change: Studio Next is the development preview, it runs executor
**v0.3.x**, and the Python standard library there is a different shape. A
contract written for the stable Studio is rejected before it runs, with
`invalid_contract runner malformed`, and with the right runner id it gets one
step further and exits 1.

What actually changed, read from
`genlayerlabs/genvm-executor`, branch `v0.3.x`,
`runners/genlayer-py-std/src/genlayer/__init__.py`, rather than guessed:

* the import is `import genlayer as gl`, and the star import is gone
* everything hangs off `gl`: `gl.TreeMap`, `gl.DynArray`, `gl.u256`,
  `gl.Address`, where before they were bare names
* the base class moved to `gl.contract.Contract`
* `gl.get_contract_at(a)` became `gl.contract.get_at(a)`
* paying a plain address no longer needs a declared interface:
  `gl.contract.get_at(a).emit_transfer(gl.u256(n))`
* the file opens with a version line, `# v0.3.0`, above the runner comment

This does the mechanical part and refuses to guess at the rest. Anything it
cannot rewrite it reports, so a half ported file is never written quietly.
"""

import io
import re
import sys
import os

RUNNER_V03 = "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng"

# The bare names the old star import brought in, which now live under `gl`.
UNDER_GL = [
    "TreeMap", "DynArray", "Array", "Address", "Lazy",
    "u8", "u16", "u24", "u32", "u40", "u48", "u56", "u64",
    "u128", "u160", "u168", "u256", "i8", "i16", "i32", "i64", "i128", "i256",
    "bigint", "bytes32",
]

# Things this cannot port on its own, and would be dangerous to try.
SUSPECT = [
    (r"@gl\.evm\.contract_interface", "an evm contract interface: v0.3 uses "
     "gl.contract.interface, and a plain payment needs no interface at all"),
    (r"gl\.deploy_contract", "deploying from inside a contract: check "
     "gl.contract.deploy in v0.3"),
    (r"gl\.advanced", "the advanced module moved; check it by hand"),
]


def port(source: str) -> tuple[str, list[str]]:
    notes = []
    text = source

    # The header. Everything above the first import is prose and stays.
    text = re.sub(r'^#\s*\{\s*"Depends".*?\}\s*\n',
                  '# v0.3.0\n# { "Depends": "' + RUNNER_V03 + '" }\n',
                  text, count=1, flags=re.M)
    if RUNNER_V03 not in text:
        notes.append("no runner comment was found to replace")

    text = text.replace("from genlayer import *", "import genlayer as gl", 1)
    if "import genlayer as gl" not in text:
        notes.append("no star import was found; check the imports by hand")

    text = text.replace("gl.Contract", "gl.contract.Contract")
    text = text.replace("gl.get_contract_at(", "gl.contract.get_at(")

    # Bare names to gl.names, on word boundaries, and never inside a longer
    # identifier or after a dot.
    for name in UNDER_GL:
        text = re.sub(r"(?<![\w.])" + name + r"(?![\w])", "gl." + name, text)

    # Storage collections have to be written out through the storage module.
    # `gl.DynArray` and `gl.storage.DynArray` are the same object, so this looks
    # like a style preference and is not: a class body annotated with the short
    # spelling deploys, is charged for, finalizes, and comes back ERROR with
    # exit_code 1 and an empty stderr. The generator that lays out storage
    # resolves these by their written path. Read off the examples Studio Next
    # ships, which all use the long one.
    for name in ("TreeMap", "DynArray", "Array"):
        text = text.replace("gl." + name + "[", "gl.storage." + name + "[")
        text = text.replace("gl.storage.storage." + name + "[", "gl.storage." + name + "[")

    # The star import line itself must not be rewritten into gl.
    text = text.replace("import genlayer as gl.", "import genlayer as gl")

    # The integer types stopped being constructors. In v0.3 `u256` is
    # `typing.Annotated[int, ...]`, so `u256(0)` is calling an annotation and
    # the contract dies at import with nothing on stderr. As an annotation it is
    # unchanged, so only the calls come out.
    for name in ("u8", "u16", "u24", "u32", "u40", "u48", "u56", "u64",
                 "u128", "u160", "u168", "u256",
                 "i8", "i16", "i32", "i64", "i128", "i256"):
        text = re.sub(r"gl\." + name + r"\(([^()]*(?:\([^()]*\)[^()]*)*)\)",
                      lambda m: m.group(1), text)

    for pattern, why in SUSPECT:
        if re.search(pattern, text):
            notes.append(why)

    return text, notes


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    source_path, out_path = sys.argv[1], sys.argv[2]
    with io.open(source_path, encoding="utf-8") as fh:
        source = fh.read()
    ported, notes = port(source)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with io.open(out_path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(ported)
    print("wrote " + out_path)
    for note in notes:
        print("  by hand: " + note)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
