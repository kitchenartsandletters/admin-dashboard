from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import router as interest_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://admin.kitchenartsandletters.com",
                   "https://www.kitchenartsandletters.com",
                   "http://localhost:5173"
                   ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the interest route
app.include_router(interest_router, prefix="/api")
