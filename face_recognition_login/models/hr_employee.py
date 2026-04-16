from odoo import fields, models, _
from odoo.exceptions import UserError


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    face_recognition_enabled = fields.Boolean(
        related='user_id.face_recognition_enabled',
        readonly=True,
        string='Face Recognition Login',
    )
    face_registered_at = fields.Datetime(
        related='user_id.face_registered_at',
        readonly=True,
        string='Face Registered At',
    )
    face_image = fields.Binary(
        related='user_id.face_image',
        readonly=True,
        string='Face Photo',
    )

    def action_register_face(self):
        self.ensure_one()
        if not self.user_id:
            raise UserError(_('Please link a user to this employee before registering a face.'))
        return self.user_id.action_register_face()

    def action_clear_face_data(self):
        self.ensure_one()
        if not self.user_id:
            raise UserError(_('Please link a user to this employee before clearing face data.'))
        self.user_id.clear_face_data()
        return {'type': 'ir.actions.client', 'tag': 'reload'}
