import os

# Configuration
OUTPUT_FILE = "project_context.txt"
ROOT_DIR = "."

# Directories to exclude from traversal
EXCLUDE_DIRS = {
    ".git",
    "node_modules",
    "target",
    ".expo",
    "ios",
    "android",
    "build",
    "dist",
    "__pycache__",
    ".gemini"
}

# Specific files or extensions to exclude
EXCLUDE_FILES = {
    "Cargo.lock",
    "package-lock.json",
    "yarn.lock",
    "project_context.txt", # Don't read the file we're writing to
    ".DS_Store",
    "gather_context.py" # Exclude this script itself
}

EXCLUDE_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", # images
    ".ttf", ".otf", ".woff", ".woff2", ".eot", # fonts
    ".mp3", ".wav", ".mp4", # media
    ".pdf", ".zip", ".tar", ".gz", # archives/docs
    ".so", ".dylib", ".dll", ".class", ".pyc" # binaries
}

def should_process_file(file_name):
    if file_name in EXCLUDE_FILES:
        return False
    
    # Check extensions
    _, ext = os.path.splitext(file_name)
    if ext.lower() in EXCLUDE_EXTENSIONS:
        return False
        
    return True

def generate_context():
    print(f"Generating context into {OUTPUT_FILE}...")
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        out.write("# Football Shots - Project Context\n\n")
        out.write("This file contains the combined source code of the project.\n")
        out.write("=" * 80 + "\n\n")
        
        file_count = 0
        
        for root, dirs, files in os.walk(ROOT_DIR):
            # Modify dirs in-place to skip excluded directories
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            
            for file in files:
                if not should_process_file(file):
                    continue
                    
                file_path = os.path.join(root, file)
                
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                        
                    # Skip completely empty files
                    if not content.strip():
                        continue
                        
                    out.write(f"\n\n{'=' * 80}\n")
                    out.write(f"File: {file_path.replace('./', '')}\n")
                    out.write(f"{'=' * 80}\n\n")
                    out.write(content)
                    out.write("\n")
                    
                    file_count += 1
                    
                except UnicodeDecodeError:
                    # Skip files that aren't readable as UTF-8 (likely binary)
                    print(f"Skipping binary file: {file_path}")
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")
                    
    print(f"Done! Combined {file_count} files into {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_context()
