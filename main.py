
""" Entry point file """
from typer import Typer


app = Typer()


@app.command()
def greeting(name: str):
    """ Print callers name """
    print(f"Hello {name}")

@app.command()
def training(name: str, payment: float):
    """ Register to make payment """
    print(f"{name} paid {payment}")

if __name__ == "__main__":
    app()
