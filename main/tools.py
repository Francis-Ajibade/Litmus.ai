from agents import Agent, RunContextWrapper, Runner, function_tool, input_guardrail
from agents.extensions.models.litellm_model import LitellmModel
import os
import difflib
from pydantic import BaseModel, Field
from main import CHECK_INPUT
from main.new_code import RunState
from main.samples import PEP8_SAMPLE, RESTYLE_SYSTEM_PROMPT
from typing import Literal

    
class InputCheck(BaseModel):
    """The classifier's whole vocabulary.

    A structured output rather than a parsed word: the SDK sends this schema to
    the model as a response format and hands back a typed object, so there is no
    string to lowercase, strip, or compare — and no way for a chatty model to
    answer "yes, definitely!" and slip past an equality check. One field, because
    one field is the entire decision.
    """
    verdict: Literal["ok", "too_vague", "not_coding"]  # <-- The Literal field

input_classifier = Agent(
    name="Input_Classifier_Agent",
    instructions= CHECK_INPUT,
    model="o3-mini",
    output_type=InputCheck,
)

async def classify_input(problem: str) -> str:
        
    try:
        result = await Runner.run(input_classifier, problem)
        return result.final_output_as(InputCheck).verdict
    except Exception as e:
        print(f"[classifier] unavailable, failing open: {e}")
        return "ok"
             

MAX_SAMPLE_LINES = 80

class StyledCode(BaseModel):
    """The restyled snippet, and nothing else.

    A structured field rather than a raw reply: a model asked for "only code"
    still opens with a markdown fence often enough that every caller would need
    the same stripping logic. The schema makes the fence impossible instead.
    """
    code: str = Field(description="the complete restyled snippet, valid Python")

style_model = Agent(
    name="Style_Model",
    instructions=RESTYLE_SYSTEM_PROMPT,
    model=LitellmModel(
        model="anthropic/claude-haiku-4-5",
        api_key=os.getenv("ANTHROPIC_API_KEY"),
    ),
    output_type=StyledCode,
)

def _restyle_user_content(description: str | None, sample_code: str | None , base : str) -> str:
    parts = [f"SNIPPET TO RESTYLE:\n{base}"]
    if description:
        parts.append(f"\nSTYLE DESCRIPTION:\n{description}")
    if sample_code:
        parts.append(f"\nSTYLE SAMPLE — copy its conventions, not its content:\n{sample_code}")
    return "\n".join(parts)

@function_tool
async def restyle_code(
    wrapper: RunContextWrapper[RunState],
    description: str | None = None,
    sample_code: str | None = None,
) -> str:
    """Render the reference snippet in the style the user asked for.

    Call this when the user says how they want code written — naming, comments,
    docstrings, type hints, structure — or pastes a piece of code as an example
    of the style they like. Pass their words as description, their pasted code as
    sample_code, or both when they gave both.

    This restyles a fixed reference snippet so the user can see the style before
    any of their own code is generated. It never touches their problem.
    """

    state = wrapper.context

    # Stage-filtered: the style is settled once the user moves past styling, and
    # a tool that refuses in its own words lets the model explain it.
    if state.stage != "styling":
        return (
            "Not available now — the style was locked in when the user continued. "
            "Only offer restyling while the styling stage is open."
        )

    if description is None and sample_code is None:
        return "No style given. Ask the user to describe the style or paste a sample."

    if sample_code is not None and len(sample_code.splitlines()) > MAX_SAMPLE_LINES:
        return (
            f"That sample is {len(sample_code.splitlines())} lines, over the "
            f"{MAX_SAMPLE_LINES}-line limit. Ask the user for a shorter excerpt."
        )
    
    base = state.style_sample or PEP8_SAMPLE

    result = await Runner.run(style_model, _restyle_user_content(description, sample_code, base))
    styled = result.final_output_as(StyledCode)

    diff = "".join(difflib.unified_diff(
        base.splitlines(keepends=True),
        styled.code.splitlines(keepends=True),
        fromfile="before",
        tofile="after",
    ))

    state.style_diff = diff or "No change - the snippet already matched that style."
    state.style_sample = styled.code
    return styled.code

@function_tool
def record_style(wrapper: RunContextWrapper[RunState], style: str) -> str:
    """Write down the style that is now in force.

    Call this immediately after restyle_code, once you have read the code it
    returned. What you write here is not a message to the user — it is the
    instruction the code generator will follow later, and the text saved if the
    user keeps this style and applies it to a different problem months from now.

    So describe the STYLE, not what just happened. It must stand on its own with
    no conversation around it.

      good: "camelCase methods, no docstrings, a short comment above each block,
             no type hints, single quotes"
      bad:  "I switched it to camelCase and took the docstrings out as you asked"

    Talk to the user in your reply as normal. This is the other copy.
    """
    if not style.strip():
        return "Nothing recorded — describe the style in a sentence and call this again."

    wrapper.context.style = style
    return "Style recorded."
