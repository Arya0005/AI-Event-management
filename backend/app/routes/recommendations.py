from fastapi import APIRouter, Depends

from app.auth import CurrentUser, require_manager
from app.ml import recommend
from app.ml.predict import registry
from app.routes.predictions import run_model
from app.schemas import PredictionInput

router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])


@router.post("/venue")
def venue(data: PredictionInput, _: CurrentUser = Depends(require_manager)):
    return run_model(lambda p: recommend.recommend_venue(registry, p), data.model_dump())


@router.post("/equipment")
def equipment(data: PredictionInput, _: CurrentUser = Depends(require_manager)):
    """Equipment and other resource budgets per expense category."""
    return run_model(lambda p: recommend.recommend_resources(registry, p), data.model_dump())
