# The second twenty. The first asked whether the guard can tell true from false;
# this one asks whether it gives the same answer twice, and what it does at the
# edges where the arithmetic is a hair either side of the line.
import io
import os

S = {}

# --- the same claim, unchanged, to be sent five times over. If the verdict moves
#     between identical runs then none of the other results mean very much.
S['x_stable_true'] = """Address 0x0b57877ec84d96b672cd47d8ea4424283fdb9f6c deposited 40000000000000000 wei into this vault and has now withdrawn 30000000000000000 wei of it, seventy five percent of its position, about forty seconds after depositing and well inside the ten minute window the published line names. The vault holds 10000000000000000 wei."""

# --- boundaries: the line forbids more than half, so exactly half is not a breach.
S['x_exactly_half'] = """Address 0x0b57877ec84d96b672cd47d8ea4424283fdb9f6c deposited 40000000000000000 wei into this vault and has withdrawn 20000000000000000 wei of it inside the ten minute window the line names. That is half of the position, and half is the most the line allows anybody to take."""

S['x_hair_over'] = """Address 0x0b57877ec84d96b672cd47d8ea4424283fdb9f6c deposited 40000000000000000 wei into this vault and has withdrawn 21000000000000000 wei of it inside the ten minute window the line names. That is fifty two and a half percent of the position, which is more than the half the line allows. The vault holds 19000000000000000 wei."""

# --- every condition of the actor line met, and the number a whisker short.
S['x_under_third'] = """Two addresses are acting as one in this vault. The vault reports two positions funded with 40000000000000000 wei each, moments apart, and each has since withdrawn 13000000000000000 wei, moments apart and in the same order they were funded. Total deposited 80000000000000000 wei, total withdrawn 26000000000000000 wei, currently held 54000000000000000 wei. Between them they have taken thirty two and a half percent of everything deposited, and the line allows a third."""

# --- one address, three small withdrawals, none of them a breach on its own.
S['x_cumulative'] = """Address 0x0b57877ec84d96b672cd47d8ea4424283fdb9f6c deposited 40000000000000000 wei into this vault and has since made three separate withdrawals of 10000000000000000 wei each, all of them inside the same ten minute window. No single one of those transactions is more than a quarter of the position, but together they are 30000000000000000 wei, seventy five percent of what was deposited, and the line speaks of what an address withdraws inside a window rather than of what it withdraws in one transaction. The vault holds 10000000000000000 wei."""

S['x_appeal_single_tx'] = """The line our vault published forbids an address withdrawing more than half of its deposit inside a ten minute window. Read as written, that is a statement about a withdrawal, and no withdrawal here came close: there were three of them and each was a quarter of the position, comfortably inside the limit on every occasion. The alarm has added three lawful actions together and called the sum unlawful, which is not what the line says and not what a depositor reading it would understand. If we had meant to cap the total we would have written the total. The stop should be lifted."""

# --- the same true claim, in the language its author actually speaks.
S['x_turkish'] = """0x0b57877ec84d96b672cd47d8ea4424283fdb9f6c adresi bu kasaya 40000000000000000 wei yatirdi ve yatirdiktan yaklasik kirk saniye sonra bunun 30000000000000000 wei kadarini cekti. Bu, pozisyonunun yuzde yetmis besi eder ve yayinlanan kirmizi cizginin belirttigi on dakikalik pencerenin tamamen icindedir. Kasada su anda 10000000000000000 wei bulunuyor."""

# --- shorter than the contract will accept, so the round never runs.
S['x_too_short'] = """Draining."""

here = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scenarios')
for name, text in S.items():
    io.open(os.path.join(here, name + '.txt'), 'w', encoding='utf-8').write(text.strip() + '\n')
print(len(S), 'more scenarios written')
