# -*- coding: utf-8 -*-
#############################################################################
#    Face Recognition Login
#
#    AS Pvt. Ltd.
#
#    Copyright (C) 2026-TODAY AS Pvt. Ltd.
#    Author: AS Pvt. Ltd. Solutions
#
#    You can modify it under the terms of the GNU LESSER
#    GENERAL PUBLIC LICENSE (LGPL v3), Version 3.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU LESSER GENERAL PUBLIC LICENSE (LGPL v3) for more details.
#
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    (LGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
#
#############################################################################


{
    'name': 'Face Recognition Login',
    'version': '19.0.1.0.0',
    'category': 'Extra Tools',
    'summary': 'Login to Odoo using face recognition via webcam',
    'description': """
        This module adds face recognition based login to Odoo.
        Users can register their face and then log in by simply
        looking at their webcam instead of entering a password.
        Uses face-api.js for in-browser face detection and matching.
    """,
    'author': 'Custom Development',
    'depends': ['web', 'base_setup', 'hr'],
    'images': ["static/description/banner_face.png"],
    'data': [
        'security/ir.model.access.csv',
        'views/res_users_views.xml',
        'views/hr_employee_views.xml',
        'views/login_template.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'face_recognition_login/static/src/css/face_login.css',
        ],
        'web.assets_frontend_minimal': [
            'face_recognition_login/static/src/js/face_login.js',
        ],
        'web.assets_backend': [
            'face_recognition_login/static/src/css/face_register.css',
            'face_recognition_login/static/src/js/face_register.js',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
