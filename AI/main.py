from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Optional
import openai
import os
from dotenv import load_dotenv
import json

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)




class DayPlanRequest(BaseModel):
    location: str
    preferences: Optional[str] = None


class Activity(BaseModel):
    time: str
    title: str
    details: str


class DayPlan(BaseModel):
    morning: List[Activity]
    afternoon: List[Activity]
    evening: List[Activity]


async def stream_openai_response(response):
    collected_chunks = []
    for chunk in response:
        if hasattr(chunk.choices[0].delta, 'content') and chunk.choices[0].delta.content is not None:
            content = chunk.choices[0].delta.content
            collected_chunks.append(content)
            yield f"data: {json.dumps({'content': content})}\n\n"
    
    # After streaming is complete, yield the complete JSON
    complete_response = "".join(collected_chunks)
    try:
        parsed_json = json.loads(complete_response)
        yield f"data: {json.dumps({'complete': parsed_json})}\n\n"
    except json.JSONDecodeError:
        yield f"data: {json.dumps({'error': 'Invalid JSON response'})}\n\n"

@app.post("/ai/day-plan")
async def generate_day_plan(request: DayPlanRequest):
    try:
        # Initialize OpenAI client
        client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        
        # Create the prompt for OpenAI
        prompt = f"""Generate a detailed day plan for {request.location}. 
        Format the response as a JSON with morning, afternoon, and evening activities.
        Each activity should have a time, title, and details.
        Include specific locations, estimated costs, and practical details.
        {f'Consider these preferences: {request.preferences}' if request.preferences else ''}
        
        The response should be in this exact format:
        {{
            "morning": [
                {{
                    "time": "HH:MM",
                    "title": "Activity Title",
                    "details": "Detailed description with practical info"
                }}
            ],
            "afternoon": [
                {{
                    "time": "HH:MM",
                    "title": "Activity Title",
                    "details": "Detailed description with practical info"
                }}
            ],
            "evening": [
                {{
                    "time": "HH:MM",
                    "title": "Activity Title",
                    "details": "Detailed description with practical info"
                }}
            ]
        }}"""

        # Call OpenAI API with streaming
        response = client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": "You are a helpful travel and lifestyle assistant that creates detailed day plans."},
                {"role": "user", "content": prompt}
            ],
            response_format={ "type": "json_object" },
            temperature=0.4,
            stream=True,
        )

        return StreamingResponse(
            stream_openai_response(response),
            media_type="text/event-stream"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
