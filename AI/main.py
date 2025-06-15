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
    bookingContext: Optional[dict] = None


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
        
        # Extract booking details
        booking = request.bookingContext
        desk_details = booking.get('deskDetails', {})
        slot_details = booking.get('slotDetails', {})
        building_details = booking.get('buildingDetails', {})
        booking_date = booking.get('bookingDate')

        # Create the prompt for OpenAI
        prompt = f"""Generate a detailed day plan for a professional working at {building_details.get('name')} located at {request.location}. 
        
        Important Context:
        - Desk Booking: {desk_details.get('name')} ({desk_details.get('description')})
        - Floor: {desk_details.get('floor')}
        - Work Hours: {slot_details.get('startTime')} to {slot_details.get('endTime')}
        - Booking Date: {booking_date}
        - Building: {building_details.get('name')}
        
        Create a balanced day plan that includes:
        1. Work-related activities (meetings, focused work time, status calls)
        2. Breaks and meals (breakfast, lunch, coffee breaks)
        3. Wellness activities (short walks, stretching)
        4. Networking opportunities
        5. Local amenities and services near the office
        
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
        }}

        Guidelines:
        1. Schedule work activities during the booked desk hours ({slot_details.get('startTime')} to {slot_details.get('endTime')})
        2. Include at least one status call or team meeting
        3. Add short breaks between work sessions
        4. Suggest nearby places for meals and coffee
        5. Consider the building's location for nearby activities
        6. Include practical details like walking distance, costs, and time estimates
        7. Make sure activities are realistic and achievable within the time constraints"""

        # Call OpenAI API with streaming
        response = client.chat.completions.create(
            model="gpt-4-turbo-preview",
            messages=[
                {"role": "system", "content": "You are a helpful day planner for a working professional who wanted you to create detailed day plans."},
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
