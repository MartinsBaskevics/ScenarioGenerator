from dataclasses import dataclass

# requirement datu klase
@dataclass
class Requirement:
    id: str
    text: str

    def to_dict(self) -> dict:
        return {"id": self.id, "text": self.text}
