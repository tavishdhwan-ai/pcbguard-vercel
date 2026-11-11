"""Lightweight Git commit tool for environments without git CLI."""
import os
import sys
import time
import zlib
import hashlib

GIT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".git")

def hash_object(data, obj_type):
    header = f"{obj_type} {len(data)}\0".encode()
    full_data = header + data
    sha = hashlib.sha1(full_data).hexdigest()
    path = os.path.join(GIT_DIR, "objects", sha[:2], sha[2:])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        with open(path, "wb") as f:
            f.write(zlib.compress(full_data))
    return sha

def create_tree(dir_path):
    entries = []
    # Ignored directories
    ignored = {".git", "node_modules", "__pycache__", ".venv"}
    for item in sorted(os.listdir(dir_path)):
        if item in ignored:
            continue
        full_path = os.path.join(dir_path, item)
        if os.path.isfile(full_path):
            with open(full_path, "rb") as f:
                content = f.read()
            sha = hash_object(content, "blob")
            entries.append((b"100644", item.encode(), bytes.fromhex(sha)))
        elif os.path.isdir(full_path):
            sub_sha = create_tree(full_path)
            if sub_sha:
                entries.append((b"40000", item.encode(), bytes.fromhex(sub_sha)))

    if not entries:
        return None
    # Sort entries according to git tree ordering (directories have trailing slash for sort)
    def sort_key(e):
        name = e[1] + (b"/" if e[0] == b"40000" else b"")
        return name
    entries.sort(key=sort_key)
    
    tree_data = b"".join(mode + b" " + name + b"\0" + sha_bytes for mode, name, sha_bytes in entries)
    return hash_object(tree_data, "tree")

def commit(message, author="Tavish <tavishdhawan3103@gmail.com>"):
    root_dir = os.path.dirname(GIT_DIR)
    tree_sha = create_tree(root_dir)
    
    with open(os.path.join(GIT_DIR, "HEAD"), "r") as f:
        head_ref = f.read().strip()
    
    parent_sha = None
    ref_path = None
    if head_ref.startswith("ref: "):
        ref_path = os.path.join(GIT_DIR, head_ref[5:].replace("/", os.sep))
        if os.path.exists(ref_path):
            with open(ref_path, "r") as f:
                parent_sha = f.read().strip()
    
    ts = int(time.time())
    commit_lines = [f"tree {tree_sha}"]
    if parent_sha:
        commit_lines.append(f"parent {parent_sha}")
    commit_lines.append(f"author {author} {ts} +0530")
    commit_lines.append(f"committer {author} {ts} +0530")
    commit_lines.append(f"\n{message.strip()}\n")
    
    commit_data = "\n".join(commit_lines).encode("utf-8")
    commit_sha = hash_object(commit_data, "commit")
    
    if ref_path:
        os.makedirs(os.path.dirname(ref_path), exist_ok=True)
        with open(ref_path, "w") as f:
            f.write(commit_sha + "\n")
    
    print(f"Created commit {commit_sha[:8]}: {message.strip()}")
    return commit_sha

if __name__ == "__main__":
    msg = sys.argv[1] if len(sys.argv) > 1 else "Update"
    commit(msg)
