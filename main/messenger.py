import requests
import os
from dotenv import load_dotenv

load_dotenv(override=True)

pushover_user = os.getenv("PUSHOVER_USER")
pushover_token = os.getenv("PUSHOVER_TOKEN")
pushover_url = "https://api.pushover.net/1/messages.json"

def push(message):
    print(f"push: {message}")
    payload = {"user" : pushover_user, "token" : pushover_token, "message" : message}
    requests.post(pushover_url, data = payload)
