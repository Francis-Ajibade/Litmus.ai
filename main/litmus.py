from agents import Agent, ModelSettings
import os
from agents.extensions.models.litellm_model import LitellmModel
from main import LITMUS_SYSTEM_PROMPT
from main.tools import restyle_code

anthropic_api_key = os.getenv('ANTHROPIC_API_KEY')

litmus  = Agent(
        name = "Litmus",
        instructions=LITMUS_SYSTEM_PROMPT,
        model=LitellmModel(
            model="anthropic/claude-opus-5",      # native Anthropic route, not the shim
            api_key=anthropic_api_key,
        ),
        model_settings=ModelSettings(
            max_tokens=16000,
            extra_args={"reasoning_effort": "low"},
        ),
        tools=[restyle_code],
        output_type=None,
)

