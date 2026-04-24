"""
Example NexusMind Extension.

Each extension receives a `hooks` object in setup() to register
callbacks for various NexusMind events.
"""


def setup(hooks):
    """Called when the extension is loaded. Register event hooks here."""
    hooks.register("note.created", on_note_created)
    hooks.register("note.updated", on_note_updated)
    hooks.register("chat.message", on_chat_message)
    print("[ExampleExtension] Loaded successfully!")


def teardown():
    """Called when the extension is unloaded."""
    print("[ExampleExtension] Unloaded.")


async def on_note_created(note: dict):
    """Called when a new note is created."""
    print(f"[ExampleExtension] New note: {note.get('title')}")


async def on_note_updated(note: dict):
    """Called when a note is updated."""
    print(f"[ExampleExtension] Note updated: {note.get('title')}")


async def on_chat_message(message: dict):
    """Called when a chat message is sent."""
    print(f"[ExampleExtension] Chat: {message.get('content', '')[:50]}")
