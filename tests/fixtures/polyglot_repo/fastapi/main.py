from fastapi import FastAPI, Depends

app = FastAPI()

AWS_ACCESS_KEY = "AKIA9876543210ZYXWVU"

@app.get("/api/v1/items")
async def list_items(svc: ItemService = Depends(get_item_service)):
    return svc.get_items()
