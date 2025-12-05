"""
API routes for ComfyUI_JomaNodes extension.
Provides endpoints for file system operations on the input folder.
"""

import os
from aiohttp import web
from server import PromptServer
import folder_paths

routes = PromptServer.instance.routes


def get_file_info(path: str, name: str) -> dict:
    """Get file/directory information."""
    full_path = os.path.join(path, name)
    is_dir = os.path.isdir(full_path)
    
    info = {
        "name": name,
        "type": "directory" if is_dir else "file",
        "path": os.path.relpath(full_path, folder_paths.get_input_directory()),
    }
    
    if not is_dir:
        try:
            stat = os.stat(full_path)
            info["size"] = stat.st_size
            info["modified"] = stat.st_mtime
            # Get file extension
            _, ext = os.path.splitext(name)
            info["extension"] = ext.lower() if ext else ""
        except OSError:
            info["size"] = 0
            info["modified"] = 0
            info["extension"] = ""
    
    return info


def build_file_tree(directory: str, base_path: str = None) -> list:
    """
    Recursively build a file tree structure from a directory.
    
    Args:
        directory: The directory to scan
        base_path: The base input directory for calculating relative paths
        
    Returns:
        List of file/directory info dictionaries with nested children for directories
    """
    if base_path is None:
        base_path = directory
        
    result = []
    
    try:
        entries = os.listdir(directory)
    except PermissionError:
        return result
    except FileNotFoundError:
        return result
    
    # Sort entries: directories first, then files, both alphabetically
    dirs = []
    files = []
    
    for entry in entries:
        # Skip hidden files and directories
        if entry.startswith('.'):
            continue
            
        full_path = os.path.join(directory, entry)
        if os.path.isdir(full_path):
            dirs.append(entry)
        else:
            files.append(entry)
    
    dirs.sort(key=str.lower)
    files.sort(key=str.lower)
    
    # Process directories first
    for name in dirs:
        full_path = os.path.join(directory, name)
        rel_path = os.path.relpath(full_path, base_path)
        
        item = {
            "name": name,
            "type": "directory",
            "path": rel_path.replace(os.sep, '/'),
            "children": build_file_tree(full_path, base_path)
        }
        result.append(item)
    
    # Then process files
    for name in files:
        full_path = os.path.join(directory, name)
        rel_path = os.path.relpath(full_path, base_path)
        
        item = {
            "name": name,
            "type": "file",
            "path": rel_path.replace(os.sep, '/'),
        }
        
        try:
            stat = os.stat(full_path)
            item["size"] = stat.st_size
            item["modified"] = stat.st_mtime
            _, ext = os.path.splitext(name)
            item["extension"] = ext.lower() if ext else ""
        except OSError:
            item["size"] = 0
            item["modified"] = 0
            item["extension"] = ""
            
        result.append(item)
    
    return result


@routes.get("/jomanodes/input/tree")
async def get_input_tree(request):
    """
    Get the complete file tree of the input directory.
    
    Returns a JSON structure with nested files and directories.
    """
    try:
        input_dir = folder_paths.get_input_directory()
        
        if not os.path.exists(input_dir):
            return web.json_response({
                "success": False,
                "error": "Input directory does not exist",
                "tree": []
            }, status=200)
        
        tree = build_file_tree(input_dir)
        
        return web.json_response({
            "success": True,
            "root": input_dir,
            "tree": tree
        }, content_type='application/json')
        
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": str(e),
            "tree": []
        }, status=500)


@routes.get("/jomanodes/input/list")
async def get_input_list(request):
    """
    Get a flat list of files in the input directory or a subdirectory.
    
    Query params:
        path: Optional subdirectory path relative to input directory
    """
    try:
        input_dir = folder_paths.get_input_directory()
        rel_path = request.rel_url.query.get("path", "")
        
        # Sanitize path to prevent directory traversal
        if rel_path:
            # Normalize and check for traversal attempts
            rel_path = os.path.normpath(rel_path)
            if rel_path.startswith('..') or os.path.isabs(rel_path):
                return web.json_response({
                    "success": False,
                    "error": "Invalid path"
                }, status=400)
        
        target_dir = os.path.join(input_dir, rel_path) if rel_path else input_dir
        
        if not os.path.exists(target_dir):
            return web.json_response({
                "success": False,
                "error": "Directory does not exist",
                "items": []
            }, status=200)
        
        if not os.path.isdir(target_dir):
            return web.json_response({
                "success": False,
                "error": "Path is not a directory",
                "items": []
            }, status=400)
        
        items = []
        try:
            entries = os.listdir(target_dir)
        except PermissionError:
            return web.json_response({
                "success": False,
                "error": "Permission denied",
                "items": []
            }, status=403)
        
        for entry in sorted(entries, key=str.lower):
            if entry.startswith('.'):
                continue
            items.append(get_file_info(target_dir, entry))
        
        return web.json_response({
            "success": True,
            "path": rel_path,
            "items": items
        }, content_type='application/json')
        
    except Exception as e:
        return web.json_response({
            "success": False,
            "error": str(e),
            "items": []
        }, status=500)

