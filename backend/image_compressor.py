"""
Module de compression automatique des images uploadees.
Compresse les images de maniere transparente selon les parametres systeme.
"""
from PIL import Image
import io
import logging

logger = logging.getLogger(__name__)

# Extensions d'images supportees pour la compression
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif', '.gif'}

# Parametres par defaut
DEFAULT_SETTINGS = {
    "enabled": True,
    "max_resolution": 1200,
    "quality": 80,
    "output_format": "jpeg"
}


async def get_compression_settings(db) -> dict:
    """Recupere les parametres de compression depuis la base de donnees."""
    try:
        settings = await db.system_settings.find_one({"key": "image_compression"})
        if settings:
            return {
                "enabled": settings.get("enabled", DEFAULT_SETTINGS["enabled"]),
                "max_resolution": settings.get("max_resolution", DEFAULT_SETTINGS["max_resolution"]),
                "quality": settings.get("quality", DEFAULT_SETTINGS["quality"]),
                "output_format": settings.get("output_format", DEFAULT_SETTINGS["output_format"])
            }
    except Exception as e:
        logger.warning(f"[IMAGE] Erreur lecture parametres compression: {e}")
    return DEFAULT_SETTINGS.copy()


def is_image_file(filename: str) -> bool:
    """Verifie si le fichier est une image compressible."""
    if not filename:
        return False
    ext = '.' + filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    return ext in IMAGE_EXTENSIONS


def compress_image(content: bytes, filename: str, settings: dict) -> tuple:
    """
    Compresse une image selon les parametres fournis.
    
    Returns:
        tuple: (compressed_content, new_filename, new_mime_type, was_compressed)
    """
    if not settings.get("enabled", True):
        return content, filename, None, False
    
    if not is_image_file(filename):
        return content, filename, None, False
    
    try:
        img = Image.open(io.BytesIO(content))
        
        # Conserver le mode RGBA pour les PNG avec transparence
        if img.mode == 'RGBA' and settings.get("output_format") == "jpeg":
            # Convertir RGBA -> RGB avec fond blanc pour JPEG
            background = Image.new('RGB', img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])
            img = background
        elif img.mode not in ('RGB', 'L'):
            img = img.convert('RGB')
        
        original_size = len(content)
        max_res = settings.get("max_resolution", 1200)
        quality = settings.get("quality", 80)
        output_format = settings.get("output_format", "jpeg").upper()
        
        if output_format == "JPEG":
            output_format = "JPEG"
            ext = ".jpg"
            mime = "image/jpeg"
        elif output_format == "WEBP":
            ext = ".webp"
            mime = "image/webp"
        else:
            output_format = "JPEG"
            ext = ".jpg"
            mime = "image/jpeg"
        
        # Redimensionner si necessaire
        w, h = img.size
        if max(w, h) > max_res:
            if w > h:
                new_w = max_res
                new_h = int(h * (max_res / w))
            else:
                new_h = max_res
                new_w = int(w * (max_res / h))
            img = img.resize((new_w, new_h), Image.LANCZOS)
        
        # Compresser
        buffer = io.BytesIO()
        save_kwargs = {"quality": quality, "optimize": True}
        if output_format == "JPEG":
            save_kwargs["progressive"] = True
        img.save(buffer, format=output_format, **save_kwargs)
        compressed = buffer.getvalue()
        
        compressed_size = len(compressed)
        
        # Ne compresser que si on gagne de la place
        if compressed_size >= original_size:
            return content, filename, None, False
        
        # Nouveau nom de fichier avec la bonne extension
        base = filename.rsplit('.', 1)[0] if '.' in filename else filename
        new_filename = base + ext
        
        ratio = round((1 - compressed_size / original_size) * 100)
        logger.info(f"[IMAGE] Compresse: {original_size//1024}Ko -> {compressed_size//1024}Ko (-{ratio}%) [{w}x{h} -> {img.size[0]}x{img.size[1]}]")
        
        return compressed, new_filename, mime, True
        
    except Exception as e:
        logger.warning(f"[IMAGE] Erreur compression {filename}: {e}")
        return content, filename, None, False
