import logging

logger = logging.getLogger("nexusmind.insights_extension")


def setup(hooks):
    logger.info("Insights extension setup")

    def on_note_created(payload):
        msg = f"[insights] note.created -> id={payload.get('id')} title={payload.get('title')}"
        logger.info(msg)

    async def on_note_deleted(payload):
        msg = f"[insights] note.deleted -> id={payload.get('id')} title={payload.get('title')}"
        logger.info(msg)

    hooks.register("note.created", on_note_created)
    hooks.register("note.deleted", on_note_deleted)


def teardown():
    logger.info("Insights extension teardown")
