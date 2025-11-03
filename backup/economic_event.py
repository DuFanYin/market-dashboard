import requests
import json
import os

def fetch_events():
    url = "https://query1.finance.yahoo.com/ws/screeners/v1/finance/calendar-events"
    params = {
        "countPerDay": 100,
        "economicEventsHighImportanceOnly": "true",
        "economicEventsRegionFilter": "",
        "endDate": 1763348400000,
        "modules": "economicEvents",
        "startDate": 1761447600000,
        "lang": "en-SG",
        "region": "SG"
    }

    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*",
        "Origin": "https://sg.finance.yahoo.com",
        "Referer": "https://sg.finance.yahoo.com/quote/SGD%3DX/"
    }

    r = requests.get(url, params=params, headers=headers)
    data = r.json()

    # Save full JSON response to file beside this script
    out_path = os.path.join(os.path.dirname(__file__), "economic_events.json")
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2, sort_keys=True)

    events = data["finance"]["result"]["economicEvents"]

    print(len(events))
    for i in events:
        print(len(i["records"]))

    # for day in events:
    #     # Filter only US events
    #     filtered_records = [r for r in day.get("records", []) if r.get("countryCode") == "US"]
    #     if not filtered_records:
    #         continue
    #
    #     date_str = day.get("timestampString", "Unknown date")
    #     print(f"\n===== {date_str} =====")
    #
    #     for record in filtered_records:
    #         print("Event:", record.get("event"))
    #         print("Country:", record.get("countryCode"))
    #         print("Period:", record.get("period"))
    #         print("Actual:", record.get("actual"))
    #         print("Prior:", record.get("prior"))
    #         print("Description:", (record.get("description") or ""))
    #         print("-" * 40)


if __name__ == "__main__":
    fetch_events()