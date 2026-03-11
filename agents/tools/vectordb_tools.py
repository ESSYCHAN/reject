"""Vector DB Tools - Search REJECT's semantic knowledge base."""

import os
from pinecone import Pinecone
from google.adk.tools import FunctionTool

# Lazy initialization - connect only when first used
_pc = None
_index = None

def _get_index():
    global _pc, _index
    if _index is None:
        _pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
        _index = _pc.Index("reject-knowledge")
    return _index


@FunctionTool
def search_pivot_stories(query: str, top_k: int = 3) -> dict:
    """Search for career pivot stories similar to the user's situation.
    
    Use this when a user:
    - Feels stuck in their current career
    - Wants to change industries/roles
    - Needs inspiration from others who made similar transitions
    
    Args:
        query: Describe the user's situation (e.g., "lawyer wanting to switch to tech")
        top_k: Number of stories to return (default 3)
    """
    results = _get_index().search_records(
        namespace="__default__",
        query={"top_k": top_k, "inputs": {"text": query}}
    )
    
    stories = []
    for hit in results.result.hits:
        fields = hit.fields
        if fields.get("category") == "pivot-story":
            stories.append({
                "from_role": fields.get("fromRole"),
                "to_role": fields.get("toRole"),
                "months": fields.get("transitionMonths"),
                "story": fields.get("text"),
                "relevance": hit._score
            })
    
    return {
        "found": len(stories),
        "stories": stories
    }


@FunctionTool  
def search_rejection_wisdom(query: str) -> dict:
    """Search for rejection patterns and wisdom.
    
    Use this when a user:
    - Just got rejected and wants to understand why
    - Keeps getting rejected at a specific stage
    - Needs advice on handling rejection
    
    Args:
        query: The rejection situation (e.g., "rejected after final round interview")
    """
    results = _get_index().search_records(
        namespace="__default__",
        query={"top_k": 3, "inputs": {"text": query}}
    )
    
    wisdom = []
    for hit in results.result.hits:
        fields = hit.fields
        if fields.get("category") == "rejection-wisdom":
            wisdom.append({
                "stage": fields.get("stage"),
                "advice": fields.get("text"),
                "relevance": hit._score
            })
    
    return {
        "found": len(wisdom),
        "wisdom": wisdom
    }
