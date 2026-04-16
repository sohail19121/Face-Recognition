from odoo import _, api, fields, models
from odoo.tools import format_amount


class SaleOrderLine(models.Model):
    _inherit = "sale.order.line"

    has_sale_price_range = fields.Boolean(
        string="Has Sale Price Range",
        compute="_compute_sale_price_range_guidance",
    )
    allowed_min_sale_price = fields.Monetary(
        string="Minimum Allowed Price",
        currency_field="currency_id",
        compute="_compute_sale_price_range_guidance",
    )
    allowed_max_sale_price = fields.Monetary(
        string="Maximum Allowed Price",
        currency_field="currency_id",
        compute="_compute_sale_price_range_guidance",
    )
    sale_price_range_display = fields.Char(
        string="Allowed Range",
        compute="_compute_sale_price_range_guidance",
    )
    sale_price_range_status = fields.Selection(
        [
            ("no_range", "No Range"),
            ("in_range", "In Range"),
            ("below_min", "Below Minimum"),
            ("above_max", "Above Maximum"),
        ],
        string="Range Status",
        compute="_compute_sale_price_range_guidance",
    )
    sale_price_out_of_range = fields.Boolean(
        string="Sale Price Out Of Range",
        compute="_compute_sale_price_range_guidance",
    )

    @api.depends(
        "company_id",
        "currency_id",
        "display_type",
        "order_id.date_order",
        "price_unit",
        "product_id",
        "product_id.currency_id",
        "product_id.use_variant_sale_price_range",
        "product_id.variant_min_sale_price",
        "product_id.variant_max_sale_price",
        "product_id.product_tmpl_id",
        "product_id.product_tmpl_id.currency_id",
        "product_id.product_tmpl_id.use_sale_price_range",
        "product_id.product_tmpl_id.min_sale_price",
        "product_id.product_tmpl_id.max_sale_price",
        "product_template_id",
        "product_template_id.currency_id",
        "product_template_id.use_sale_price_range",
        "product_template_id.min_sale_price",
        "product_template_id.max_sale_price",
    )
    def _compute_sale_price_range_guidance(self):
        for line in self:
            line.has_sale_price_range = False
            line.allowed_min_sale_price = 0.0
            line.allowed_max_sale_price = 0.0
            line.sale_price_range_display = False
            line.sale_price_range_status = "no_range"
            line.sale_price_out_of_range = False

            range_owner = line.product_id or line.product_template_id
            if line.display_type or not range_owner:
                continue

            company = line.company_id or line.order_id.company_id or self.env.company
            order_currency = line.currency_id or company.currency_id
            conversion_date = (
                fields.Date.to_date(line.order_id.date_order)
                if line.order_id.date_order
                else fields.Date.context_today(line)
            )

            range_data = range_owner._get_sale_price_range_data(
                currency=order_currency,
                company=company,
                date=conversion_date,
            )
            if not range_data.get("has_sale_price_range"):
                continue

            min_price = range_data["allowed_min_sale_price"]
            max_price = range_data["allowed_max_sale_price"]

            line.has_sale_price_range = True
            line.allowed_min_sale_price = min_price
            line.allowed_max_sale_price = max_price

            if order_currency.compare_amounts(min_price, max_price) == 0:
                line.sale_price_range_display = _(
                    "Target price %(price)s",
                    price=format_amount(self.env, min_price, order_currency),
                )
            else:
                line.sale_price_range_display = _(
                    "From %(min)s to %(max)s",
                    min=format_amount(self.env, min_price, order_currency),
                    max=format_amount(self.env, max_price, order_currency),
                )

            if order_currency.compare_amounts(line.price_unit, min_price) < 0:
                line.sale_price_range_status = "below_min"
                line.sale_price_out_of_range = True
            elif order_currency.compare_amounts(line.price_unit, max_price) > 0:
                line.sale_price_range_status = "above_max"
                line.sale_price_out_of_range = True
            else:
                line.sale_price_range_status = "in_range"

    # @api.onchange("product_id", "product_template_id", "price_unit")
    # def _onchange_sale_price_range_warning(self):
    #     if not self.has_sale_price_range or not self.sale_price_out_of_range:
    #         return

    #     status_label = dict(self._fields["sale_price_range_status"].selection).get(
    #         self.sale_price_range_status
    #     )
    #     return {
    #         "warning": {
    #             "title": _("Unit Price Outside Allowed Range"),
    #             "message": _(
    #                 "The unit price for %(product)s is outside the configured range.\n\nAllowed Range: %(range)s\nStatus: %(status)s",
    #                 product=self.product_template_id.display_name or self.product_id.display_name,
    #                 range=self.sale_price_range_display,
    #                 status=status_label,
    #             ),
    #         }
    #     }
