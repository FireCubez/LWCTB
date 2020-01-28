from pathlib import Path
from lark import Lark

if __name__ == "__main__":
    logger = print
else:
    log = []
    logger = log.append

grammar = Path("grammar.lark").read_text()
logger("grammar found ")

grammar_parser = Lark(grammar, start="program", parser='lalr')
logger("grammar loaded")

