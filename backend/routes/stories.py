# =============================================================================
# routes/stories.py — API voor STORIES: ophalen, toevoegen, verwijderen.
# Stories verlopen automatisch na 24 uur.
# =============================================================================

from datetime import timedelta
from flask import Blueprint, request, jsonify
from extensions import db
from models.user import User
from models.story import Story
from models.friendship import Friendship
from utils.auth import require_auth
from utils.helpers import utc_now

stories_bp = Blueprint("stories", __name__, url_prefix="/api")


@stories_bp.route("/stories", methods=["GET"])
def get_stories():
    """Geeft de stories van jou en je vrienden terug, gegroepeerd per gebruiker.
    Verwijdert eerst automatisch alle verlopen stories."""
    user_id, error, code = require_auth()
    if error:
        return error, code

    # Verlopen stories (ouder dan 24u) opruimen.
    Story.query.filter(Story.expires_at < utc_now()).delete()
    db.session.commit()

    # Stories van je vrienden + die van jezelf.
    friend_ids = [f.friend_id for f in Friendship.query.filter_by(user_id=user_id).all()]
    friend_ids.append(user_id)

    stories = Story.query.filter(Story.user_id.in_(friend_ids)).order_by(Story.created_at.desc()).all()

    # Groepeer de stories per gebruiker (zodat je per persoon één 'bolletje' ziet).
    stories_by_user: dict = {}
    for story in stories:
        if story.user_id not in stories_by_user:
            user = db.session.get(User, story.user_id)
            stories_by_user[story.user_id] = {
                "user_id": story.user_id,
                "username": user.username if user else "Unknown",
                "avatar": user.get_avatar() if user else "",
                "stories": [],
            }
        stories_by_user[story.user_id]["stories"].append(story.to_dict())

    return jsonify({"stories": list(stories_by_user.values())}), 200


@stories_bp.route("/stories/add", methods=["POST"])
def add_story():
    """Plaatst een nieuwe story die over 24 uur verloopt."""
    user_id, error, code = require_auth()
    if error:
        return error, code

    data = request.get_json(silent=True) or {}
    image_data = data.get("image_data")
    if not image_data:
        return jsonify({"error": "Afbeelding is verplicht"}), 400

    story = Story(
        user_id=user_id,
        image_data=image_data,
        expires_at=utc_now() + timedelta(hours=24),  # verloopt na 24u
    )
    db.session.add(story)
    db.session.commit()
    return jsonify({"message": "Story toegevoegd!", "story": story.to_dict()}), 201


@stories_bp.route("/stories/<int:story_id>", methods=["DELETE"])
def delete_story(story_id):
    """Verwijdert je eigen story."""
    user_id, error, code = require_auth()
    if error:
        return error, code

    story = db.session.get(Story, story_id)
    if not story or story.user_id != user_id:
        return jsonify({"error": "Story niet gevonden of geen toegang"}), 404

    db.session.delete(story)
    db.session.commit()
    return jsonify({"message": "Story verwijderd"}), 200
