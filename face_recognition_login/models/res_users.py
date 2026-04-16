import json
import logging
import math

from odoo import _, fields, models
from odoo.exceptions import UserError
from odoo.http import request

_logger = logging.getLogger(__name__)
FACE_DUPLICATE_THRESHOLD = 0.45


def _euclidean_distance(v1, v2):
    if len(v1) != len(v2):
        return float('inf')
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(v1, v2)))


def _coerce_descriptor(vector):
    if not isinstance(vector, (list, tuple)) or len(vector) != 128:
        return None
    try:
        return [float(value) for value in vector]
    except (TypeError, ValueError):
        return None


class ResUsers(models.Model):
    _inherit = 'res.users'

    face_recognition_enabled = fields.Boolean(
        string='Face Recognition Login',
        default=False,
        help='Enable face recognition as a login method for this user.'
    )
    face_descriptor = fields.Text(
        string='Face Descriptor',
        help='Stored face descriptor (JSON array of float values) for recognition.',
        groups='base.group_system',
    )
    face_image = fields.Binary(
        string='Face Photo',
        attachment=True,
        help='Reference photo used for face recognition login.'
    )
    face_registered_at = fields.Datetime(
        string='Face Registered At',
        readonly=True,
    )

    def action_register_face(self):
        """Open face registration wizard."""
        self.ensure_one()
        if request and request.session:
            request.session['face_register_target_user_id'] = self.id
        return {
            'type': 'ir.actions.act_window',
            'name': _('Register Face'),
            'res_model': 'res.users',
            'res_id': self.id,
            'view_mode': 'form',
            'view_id': self.env.ref(
                'face_recognition_login.view_res_users_face_register'
            ).id,
            'target': 'new',
        }

    def save_face_descriptor(self, descriptor_array, face_image_b64=None):
        """
        Called from JS to persist the face descriptor.
        :param descriptor_array: list of 128 floats from face-api.js
        :param face_image_b64: base64 PNG snapshot (optional)
        """
        self.ensure_one()
        descriptor_array = _coerce_descriptor(descriptor_array)
        if not descriptor_array:
            raise UserError(_('Invalid face descriptor received. Please try again.'))

        other_users = self.sudo().search([
            ('id', '!=', self.id),
            ('face_descriptor', '!=', False),
            ('active', '=', True),
        ])

        closest_user = None
        closest_distance = float('inf')
        for other_user in other_users:
            try:
                stored_descriptor = _coerce_descriptor(json.loads(other_user.face_descriptor or '[]'))
                if not stored_descriptor:
                    continue
                distance = _euclidean_distance(descriptor_array, stored_descriptor)
                if distance < closest_distance:
                    closest_distance = distance
                    closest_user = other_user
            except Exception as err:
                _logger.warning(
                    'Error while checking duplicate face registration for user %s against %s: %s',
                    self.login,
                    other_user.login,
                    err,
                )

        if closest_user and closest_distance <= FACE_DUPLICATE_THRESHOLD:
            _logger.warning(
                'Duplicate face registration blocked for user %s; closest existing user=%s distance=%.4f',
                self.login,
                closest_user.login,
                closest_distance,
            )
            raise UserError(_(
                'This face already appears to be registered for another user. '
                'Please use a different face image or clear the old registration first.'
            ))

        self.sudo().write({
            'face_descriptor': json.dumps(descriptor_array),
            'face_recognition_enabled': True,
            'face_registered_at': fields.Datetime.now(),
            'face_image': face_image_b64 or False,
        })
        return {'success': True}

    def clear_face_data(self):
        """Remove stored face data for this user."""
        self.ensure_one()
        self.sudo().write({
            'face_descriptor': False,
            'face_recognition_enabled': False,
            'face_image': False,
            'face_registered_at': False,
        })
        return {'success': True}
