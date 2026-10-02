import requests
import os
import json
import time
import asyncio

async def light_on(device_id):
    payload = {
        "commands": [
            {
                "component": "main",
                "capability": "switch",
                "command": "on"
            }
        ]
    }
    on_resp = requests.request("POST",
        url = f"https://api.smartthings.com/v1/devices/{device_id}/commands",
        headers = headers,
        json = payload
    )
    print("Status: ", on_resp.status_code)

async def light_off(device_id):
    payload = {
        "commands": [
            {
                "component": "main",
                "capability": "switch",
                "command": "off"
            }
        ]
    }
    off_resp = requests.request("POST",
        url = f"https://api.smartthings.com/v1/devices/{device_id}/commands",
        headers = headers,
        json = payload
    )
    print("Status: ", off_resp.status_code)

if __name__ == "__main__":
    headers = {
        "Authorization": f"Bearer {os.environ['smartthings_test']}",
        "Accept": "application/json"
    }
    url = "https://api.smartthings.com/v1/devices"
    response = requests.request("GET",
        url = url,
        headers = headers
    )
    #print(response.content)
    parsed_resp = response.content.decode('utf-8')
    resp_json = json.loads(parsed_resp)
    #print(resp_json.get('items'))
    for i in resp_json.get('items'):
        name = i.get('name')
        label = i.get('label')
        print("-------------------------")
        print(f"name: {name}")
        print(f"labels: {label}")
        print("-------------------------")
    # Control sofa light
    sofa_device_id = "abff90ec-f9af-47fa-b02b-36a65a257401"

    # turn light on
    #asyncio.run(light_on(sofa_device_id))
    #time.sleep(5)
    #asyncio.run(light_off(sofa_device_id))
    #with open('devices.json', 'w') as json_file:
    #    json.dump(resp_json.get('items'), json_file, indent=4)

    #Get all switches
    switch_devices = list()
    for i in resp_json.get('items'):
        components = i.get('components')
        #print(components)
        #capabilities = i.get('components').get('capabilities')
        for p in components:
            capabilities = p.get('capabilities')
            for j in capabilities:
                if j.get('id') == "switch":
                    switch_devices.append({"deviceId": i.get('deviceId'), "name": i.get('name'), "label": i.get('label')})
                    break
    pretty_data = json.dumps(switch_devices, indent=4)
    print(pretty_data)