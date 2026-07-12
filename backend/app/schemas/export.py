from pydantic import BaseModel


class DocxExportResponse(BaseModel):
    download_url: str
    expires_in: int
