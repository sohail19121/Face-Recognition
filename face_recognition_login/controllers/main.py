import json
import logging
import math

from odoo import http, _
from odoo.addons.web.controllers.home import Home
from odoo.http import request
from odoo.service import security

_logger = logging.getLogger(__name__)

FACE_MATCH_THRESHOLD = 0.55
FACE_MATCH_MARGIN = 0.05


def _euclidean_distance(v1, v2):
    """Compute Euclidean distance between two descriptor vectors."""
    if len(v1) != len(v2):
        return float('inf')
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(v1, v2)))


def _coerce_descriptor(vector):
    """Validate and coerce a descriptor to 128 floats."""
    if not isinstance(vector, (list, tuple)) or len(vector) != 128:
        return None
    try:
        return [float(value) for value in vector]
    except (TypeError, ValueError):
        return None


class FaceRecognitionLogin(Home):

    # ------------------------------------------------------------------ #
    #  Face verification endpoint (called by JS on the login page)        #
    # ------------------------------------------------------------------ #
    @http.route(
        '/face_login/verify',
        type='jsonrpc',
        auth='none',
        methods=['POST'],
        csrf=False,
    )
    def face_verify(self, descriptor, **kw):
        """
        Receive a 128-float face descriptor from the browser,
        compare it against all users with face_recognition_enabled=True,
        and log in the best-matching user if distance < threshold.
        """
        descriptor = _coerce_descriptor(descriptor)
        if not descriptor:
            return {'success': False, 'error': _('Invalid descriptor')}

        # Fetch all users who have face login enabled
        users = request.env['res.users'].sudo().search([
            ('face_recognition_enabled', '=', True),
            ('face_descriptor', '!=', False),
            ('active', '=', True),
        ])

        matches = []

        for user in users:
            try:
                stored = _coerce_descriptor(json.loads(user.face_descriptor or '[]'))
                if not stored:
                    continue
                dist = _euclidean_distance(descriptor, stored)
                matches.append((dist, user))
            except Exception as e:
                _logger.warning('Error comparing face for user %s: %s', user.login, e)

        matches.sort(key=lambda item: item[0])
        best_distance = matches[0][0] if matches else float('inf')
        best_user = matches[0][1] if matches else None
        second_best_distance = matches[1][0] if len(matches) > 1 else None
        margin_ok = second_best_distance is None or (
            second_best_distance - best_distance >= FACE_MATCH_MARGIN
        )

        if best_user and best_distance <= FACE_MATCH_THRESHOLD and margin_ok:
            _logger.info(
                'Face login: matched user %s (distance=%.4f, second_best=%s)',
                best_user.login,
                best_distance,
                f'{second_best_distance:.4f}' if second_best_distance is not None else 'n/a',
            )
            user_env = request.env(user=best_user.id)
            request.session.should_rotate = True
            request.session.db = request.session.db or request.env.cr.dbname
            request.session.uid = best_user.id
            request.session.login = best_user.login
            request.session.context = dict(user_env['res.users'].context_get())
            request.session.session_token = security.compute_session_token(
                request.session, user_env
            )
            return {
                'success': True,
                'uid': best_user.id,
                'redirect': self._login_redirect(best_user.id),
            }
        else:
            _logger.warning(
                'Face login: no match found (best distance=%.4f, second_best=%s, threshold=%.4f, margin_ok=%s)',
                best_distance,
                f'{second_best_distance:.4f}' if second_best_distance is not None else 'n/a',
                FACE_MATCH_THRESHOLD,
                margin_ok,
            )
            return {
                'success': False,
                'error': _('Face not recognized. Please try again or use password login.'),
            }

    # ------------------------------------------------------------------ #
    #  Save face descriptor from backend (profile page)                   #
    # ------------------------------------------------------------------ #
    @http.route(
        '/face_login/register',
        type='jsonrpc',
        auth='user',
        methods=['POST'],
        csrf=False,
    )
    def face_register(self, descriptor, face_image=None, user_id=None, **kw):
        """Save face descriptor for the target user shown in the popup."""
        current_user = request.env.user
        try:
            target_user = current_user
            target_user_id = user_id or request.session.get('face_register_target_user_id')
            if target_user_id:
                target_user = request.env['res.users'].sudo().browse(int(target_user_id)).exists()
                if not target_user:
                    return {'success': False, 'error': _('The selected user no longer exists.')}
                if (
                    target_user != current_user
                    and not current_user.has_group('base.group_system')
                    and not current_user.has_group('hr.group_hr_user')
                ):
                    return {
                        'success': False,
                        'error': _('You can only register face data for your own user.'),
                    }

            result = target_user.save_face_descriptor(descriptor, face_image)
            request.session.pop('face_register_target_user_id', None)
            return result
        except Exception as e:
            _logger.error(
                'Face registration error for %s on target user %s: %s',
                current_user.login,
                user_id or request.session.get('face_register_target_user_id') or current_user.id,
                e,
            )
            return {'success': False, 'error': str(e)}

    @http.route(
        '/face_login/clear',
        type='jsonrpc',
        auth='user',
        methods=['POST'],
        csrf=False,
    )
    def face_clear(self, **kw):
        """Remove face data for the currently logged-in user."""
        return request.env.user.clear_face_data()
