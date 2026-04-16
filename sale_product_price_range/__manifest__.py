# Part of Odoo. See LICENSE file for full copyright and licensing details.

{
    "name": "Sale Product Price Range",
    "version": "19.0.1.0.0",
    "summary": "Shows allowed product sales price ranges on sale order lines",
    "category": "Sales",
    "author": "CSL",
    "website": "https://www.odoo.com",
    "license": "LGPL-3",
    "depends": [
        "sale_management",
    ],
    "data": [
        "views/product_views.xml",
        "views/sale_order_views.xml",
    ],
    "assets": {
        "web.assets_backend": [
            "sale_product_price_range/static/src/js/product/product_price_range.js",
            "sale_product_price_range/static/src/xml/product_price_range.xml",
        ],
    },
    "installable": True,
    "application": False,
    "auto_install": False,
}
