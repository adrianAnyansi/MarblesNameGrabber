import requests
pages = range(18,65)
page_path = "testing/vod_dump/{0}.png"
url = "http://localhost:4000/debug"

for page in pages:
    curr_page = page_path.format(page)
    requests.post(url, params={"filename":curr_page}, headers={'User-Agent': "Python-runtime"})
    try:
        input(f"Sent page {page}. Waiting for input...")
    except KeyboardInterrupt:
        print("\nQuitting-")
        break