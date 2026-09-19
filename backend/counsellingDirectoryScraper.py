"""
Counselling Directory UK Scraper & Importer for BlissAgents
Extracts counsellor and therapist contacts from https://www.counselling-directory.org.uk/
Bypasses Cloudflare using DrissionPage (CDP automation).
"""

import time
import json
import os
import csv
import re
from DrissionPage import ChromiumPage, ChromiumOptions

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
JSON_OUTPUT = os.path.join(DATA_DIR, 'counselling_directory_contacts.json')
CSV_OUTPUT = os.path.join(DATA_DIR, 'counselling_directory_contacts.csv')
PROSPECTS_OUTPUT = os.path.join(DATA_DIR, 'prospects.json')

DEFAULT_CITIES = [
    'London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 
    'Edinburgh', 'Bristol', 'Liverpool', 'Sheffield', 'Brighton', 
    'Cardiff', 'Newcastle', 'Belfast', 'Nottingham', 'Oxford'
]

def ensure_data_dir():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)

def clean_phone(phone_str):
    if not phone_str:
        return ''
    cleaned = re.sub(r'[^\d+]', '', phone_str)
    if cleaned.startswith('0'):
        cleaned = '+44' + cleaned[1:]
    return cleaned

def run_scraper(cities=DEFAULT_CITIES, max_per_city=30):
    ensure_data_dir()
    
    print("Launching Chromium browser with DrissionPage...")
    co = ChromiumOptions()
    co.set_browser_path(r'C:\Program Files\Google\Chrome\Application\chrome.exe')
    co.headless(False)

    page = ChromiumPage(co)
    all_contacts = []
    seen_urls = set()

    try:
        # Step 1: Open Homepage to establish session cookies
        print("Navigating to Counselling Directory homepage...")
        page.get('https://www.counselling-directory.org.uk/')
        time.sleep(3)
        print("Homepage loaded. Title:", page.title)

        for city in cities:
            print(f"\n==========================================")
            print(f"Searching counsellors in: {city}")
            print(f"==========================================")
            
            page.get('https://www.counselling-directory.org.uk/')
            time.sleep(3)

            loc_input = page.ele('#search-filter-location') or page.ele('@placeholder=Enter your postcode, town or county') or page.ele('css:input[name="search"]')
            if loc_input:
                loc_input.clear()
                loc_input.input(f"{city}\n")
                time.sleep(4)
            else:
                print(f"Search input not found on homepage for {city}, skipping...")
                continue

            print(f"Results Page Title: {page.title} | URL: {page.url}")



            # Parse profile links and snippets from search results
            links = page.eles('css:a[href*="/counsellors/"]')
            city_contacts = []
            
            for a in links:
                href = a.link
                text = a.text.strip()
                if not href or href in seen_urls:
                    continue
                if not text or text.isdigit() or len(text) <= 3 or text == 'Counsellors':
                    continue

                # Find container text for phone and details
                parent = a.parent()
                for _ in range(3):
                    if parent and parent.tag != 'body':
                        p_text = parent.text
                        if 'Call' in p_text or any(char.isdigit() for char in p_text):
                            break
                        parent = parent.parent()

                container_text = parent.text if parent else ''
                seen_urls.add(href)

                # Extract phone number
                phones = re.findall(r'(\d{4,5}\s*\d{6}|\+?44\s*\d{10}|0\d{10}|0\d{4}\s*\d{6})', container_text)
                raw_phone = phones[0] if phones else ''
                formatted_phone = clean_phone(raw_phone)

                # Name & Accreditations
                name_parts = text.split('\n')
                clean_name = name_parts[0].strip()

                contact = {
                    'id': str(int(time.time() * 1000)) + str(len(all_contacts)),
                    'businessName': f"{clean_name} Counselling",
                    'businessType': 'Counsellor / Psychotherapist',
                    'contactPerson': clean_name,
                    'phone': raw_phone,
                    'whatsapp': formatted_phone,
                    'email': '',
                    'website': '',
                    'city': city,
                    'sourceUrl': href,
                    'notes': f"Sourced from Counselling Directory UK ({city}). {container_text.replace('\n', ' ')[:150]}".strip()
                }

                city_contacts.append(contact)
                all_contacts.append(contact)

                if len(city_contacts) >= max_per_city:
                    break

            print(f"Extracted {len(city_contacts)} base contacts for {city}. Enriching phone numbers & websites...")

            # Enrich contacts with phone numbers and websites from profile pages
            for idx, c in enumerate(city_contacts):
                try:
                    page.get(c['sourceUrl'])
                    time.sleep(1.5)

                    # Phone number
                    phone_ele = page.ele('css:a[href^="tel:"]') or page.ele('text:Call')
                    if phone_ele:
                        p_href = phone_ele.attr('href') or ''
                        r_phone = p_href.replace('tel:', '').strip() if p_href.startswith('tel:') else phone_ele.text.replace('Call', '').strip()
                        c['phone'] = r_phone
                        c['whatsapp'] = clean_phone(r_phone)

                    # Website URL
                    web_ele = page.ele('css:a[target="_blank"][rel*="nofollow"]') or page.ele('text:Visit website')
                    if web_ele:
                        c['website'] = web_ele.attr('href') or ''

                    print(f"  [{idx+1}/{len(city_contacts)}] {c['contactPerson']} | Phone: {c['phone'] or 'N/A'} | Web: {c['website'] or 'N/A'}")

                except Exception as e:
                    print(f"  [{idx+1}/{len(city_contacts)}] {c['contactPerson']} (enrichment skipped)")

            print(f"Completed enrichment for {city}")



    finally:
        page.quit()

    print(f"\n==========================================")
    print(f"Total contacts extracted across all cities: {len(all_contacts)}")

    # Save to JSON file
    with open(JSON_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(all_contacts, f, indent=2, ensure_ascii=False)
    print(f"Saved contacts to {JSON_OUTPUT}")

    # Save to CSV file
    fieldnames = ['id', 'businessName', 'contactPerson', 'businessType', 'phone', 'whatsapp', 'email', 'website', 'city', 'sourceUrl', 'notes']
    with open(CSV_OUTPUT, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for c in all_contacts:
            writer.writerow(c)
    print(f"Saved contacts to {CSV_OUTPUT}")

    # Merge into prospects.json
    existing_prospects = []
    if os.path.exists(PROSPECTS_OUTPUT):
        try:
            with open(PROSPECTS_OUTPUT, 'r', encoding='utf-8') as f:
                existing_prospects = json.load(f)
        except Exception:
            existing_prospects = []

    existing_urls = set(p.get('sourceUrl') for p in existing_prospects if p.get('sourceUrl'))
    new_count = 0
    for c in all_contacts:
        if c['sourceUrl'] not in existing_urls:
            existing_prospects.append(c)
            existing_urls.add(c['sourceUrl'])
            new_count += 1

    with open(PROSPECTS_OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(existing_prospects, f, indent=2, ensure_ascii=False)
    print(f"Merged {new_count} new prospects into {PROSPECTS_OUTPUT} (Total prospects: {len(existing_prospects)})")

    return all_contacts

if __name__ == '__main__':
    run_scraper(cities=['London', 'Manchester', 'Birmingham', 'Leeds', 'Edinburgh', 'Bristol'], max_per_city=20)

