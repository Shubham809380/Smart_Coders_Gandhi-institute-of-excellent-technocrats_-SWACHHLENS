"""
Dispatch Recommendation Engine.
Pure rule-based, no ML needed.
"""

def recommend_action(waste_type: str, volume_category: str, severity: str) -> dict:
    """Returns dispatch recommendation with team, vehicle, SLA."""
    
    if waste_type == "hazardous_waste" or severity == "critical":
        return {
            "team": "special_hazmat_team",
            "vehicle": "hazmat_van",
            "sla_hours": 2,
            "priority": "immediate",
            "instructions": "Hazardous material detected. Deploy hazmat-trained team with proper PPE. Cordon off area.",
            "required_ppe": ["gloves", "mask", "goggles", "protective_suit"],
        }
    
    if waste_type == "drain_blockage":
        return {
            "team": "drain_clearing_unit",
            "vehicle": "mini_truck",
            "sla_hours": 4,
            "priority": "high",
            "instructions": "Drain blockage detected. Deploy drain clearing crew with jetting equipment and mini tipper.",
            "required_ppe": ["gloves", "boots"],
        }
    
    if waste_type == "e_waste":
        return {
            "team": "e_waste_recycling_partner",
            "vehicle": "recycling_truck",
            "sla_hours": 24,
            "priority": "medium",
            "instructions": "E-waste detected. Route to certified e-waste recycling partner. Handle with care.",
            "required_ppe": ["gloves"],
        }
    
    if waste_type == "construction_debris" and volume_category in ["large", "very_large"]:
        return {
            "team": "heavy_cleanup_crew",
            "vehicle": "dump_truck",
            "sla_hours": 6,
            "priority": "high",
            "instructions": "Large construction debris. Deploy heavy crew with dump truck and loading equipment.",
            "required_ppe": ["helmet", "gloves", "boots"],
        }
    
    if waste_type == "plastic_waste" and volume_category in ["large", "very_large"]:
        return {
            "team": "recycling_partner",
            "vehicle": "recycling_truck",
            "sla_hours": 24,
            "priority": "medium",
            "instructions": "Large plastic waste volume. Assign sorting-capable team with recycling truck.",
            "required_ppe": ["gloves"],
        }
    
    if volume_category in ["large", "very_large"]:
        return {
            "team": "extended_cleanup_crew",
            "vehicle": "mini_truck",
            "sla_hours": 6,
            "priority": "medium",
            "instructions": "Large waste volume detected. Deploy extended crew with mini truck.",
            "required_ppe": ["gloves", "boots"],
        }
    
    if severity == "high":
        return {
            "team": "priority_cleanup_team",
            "vehicle": "standard_van",
            "sla_hours": 4,
            "priority": "high",
            "instructions": "High-severity waste reported. Assign priority cleanup team.",
            "required_ppe": ["gloves"],
        }
    
    return {
        "team": "standard_cleanup_team",
        "vehicle": None,
        "sla_hours": 24,
        "priority": "low",
        "instructions": "Standard cleanup. Assign to next available team in the ward.",
        "required_ppe": ["gloves"],
    }
