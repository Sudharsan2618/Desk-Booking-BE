import os
import time
import csv
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.chrome.options import Options as ChromeOptions
from bs4 import BeautifulSoup

# Set ChromeDriver path
chrome_driver_path = "C:/Users/SudharsanDS/Downloads/chromedriver-win64/chromedriver-win64/chromedriver.exe"
os.environ["CHROME_DRIVER_PATH"] = chrome_driver_path

BASE_URL = "https://www.naukri.com"

def extract_job_details(page_source):
    """Extract job details from the page source using BeautifulSoup."""
    soup = BeautifulSoup(page_source, 'html.parser')
    jobs = []

    job_wrappers = soup.find_all('div', class_='srp-jobtuple-wrapper')
    for job in job_wrappers:
        try:
            # Extract job title
            title_tag = job.find('a', class_='title')
            title = title_tag.text.strip() if title_tag else None
            job_url = title_tag['href'] if title_tag else None
            
            # Convert relative URLs to absolute URLs
            if job_url and not job_url.startswith("http"):
                job_url = BASE_URL + job_url
            
            # Extract company name
            company_tag = job.find('a', class_='comp-name')
            company = company_tag.text.strip() if company_tag else None
            
            # Extract salary
            salary_tag = job.find('span', class_='sal-wrap')
            salary = salary_tag.text.strip() if salary_tag else "Not Disclosed"
            
            # Extract location
            location_tag = job.find('span', class_='loc-wrap')
            location = location_tag.text.strip() if location_tag else None
            
            # Extract skills
            skills = [skill.text for skill in job.find_all('li', class_='tag-li')]
            
            # Add job details to list
            jobs.append({
                'title': title,
                'company': company,
                'salary': salary,
                'location': location,
                'skills': skills,
                'url': job_url
            })
        except Exception as e:
            print(f"Error extracting job details: {e}")
    
    return jobs


def scrape_job_description(driver, url):
    """Scrape job description from the job detail page."""
    try:
        driver.get(url)
        time.sleep(3)
        page_source = driver.page_source
        soup = BeautifulSoup(page_source, 'html.parser')
        job_description = soup.find('div', class_='styles_JDC__dang-inner-html__h0K4t')
        if job_description:
            return job_description.get_text(separator="\n").strip()
        else:
            return "Job description not found."
    except Exception as e:
        print(f"Error scraping job description: {e}")
        return None


def save_to_csv(jobs, filename):
    """Save job details to a CSV file."""
    try:
        with open(filename, mode='w', newline='', encoding='utf-8') as file:
            writer = csv.DictWriter(file, fieldnames=["Title", "Company", "Salary", "Location", "Skills", "URL", "Description"])
            writer.writeheader()
            for job in jobs:
                writer.writerow({
                    "Title": job['title'],
                    "Company": job['company'],
                    "Salary": job['salary'],
                    "Location": job['location'],
                    "Skills": ', '.join(job['skills']),
                    "URL": job['url'],
                    "Description": job.get('description', "N/A")
                })
        print(f"Job details saved to {filename}")
    except Exception as e:
        print(f"Error saving to CSV: {e}")


# Selenium setup
chrome_options = ChromeOptions()
# chrome_options.add_argument("--headless")  # Optional: Run in headless mode
service = ChromeService(executable_path=chrome_driver_path)
driver = webdriver.Chrome(service=service, options=chrome_options)

try:
    # URL to scrape
    url = "https://www.naukri.com/developer-engineer-it-jobs-in-chennai?k=developer%2C%20engineer%2C%20it&l=chennai&nignbevent_src=jobsearchDeskGNB&experience=0&jobAge=1"
    print(f"Loading page: {url}")
    driver.get(url)
    time.sleep(5)  # Wait for page to load

    # Extract job details from the main page
    page_source = driver.page_source
    job_listings = extract_job_details(page_source)

    # Scrape each job's description
    for job in job_listings:
        if job['url']:
            description = scrape_job_description(driver, job['url'])
            job['description'] = description
        else:
            job['description'] = "URL not available"

    # Save to CSV
    save_to_csv(job_listings, "job_listings.csv")

finally:
    # Close the driver
    driver.quit()
