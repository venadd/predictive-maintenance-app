from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import joblib
import numpy as np

app = FastAPI(title="Predictive Maintenance API")

# Aktifkan CORS agar frontend dapat memanggil API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Load model dan scaler
model = joblib.load(BASE_DIR / "models" / "xgb_model.joblib")
scaler = joblib.load(BASE_DIR / "models" / "scaler.joblib")

class MachineData(BaseModel):
    air_temperature: float = Field(..., example=300.0)
    process_temperature: float = Field(..., example=310.0)
    rotational_speed: float = Field(..., example=1500.0)
    torque: float = Field(..., example=40.0)
    tool_wear: float = Field(..., example=100.0)
    machine_type: str = Field(..., example="L") # Pilihan: 'L', 'M', 'H'

@app.post("/predict")
def predict_failure(data: MachineData):
    # One-hot encoding manual untuk Type_L dan Type_M sesuai urutan latih
    type_l = 1 if data.machine_type.upper() == "L" else 0
    type_m = 1 if data.machine_type.upper() == "M" else 0

    features = np.array([[
        data.air_temperature,
        data.process_temperature,
        data.rotational_speed,
        data.torque,
        data.tool_wear,
        type_l,
        type_m
    ]])

    # Scaling fitur
    scaled_features = scaler.transform(features)

    # Prediksi
    prediction = int(model.predict(scaled_features)[0])
    probabilities = model.predict_proba(scaled_features)[0].tolist()

    return {
        "prediction": prediction,
        "failure_prediction": prediction,
        "status": "Failure Detected" if prediction == 1 else "Normal Operation",
        "failure_probability": round(probabilities[1], 4)
    }