from odoo import fields, models
from odoo import api
from odoo.exceptions import ValidationError
from odoo import _


class ProductProduct(models.Model):
    _inherit = "product.product"

    use_sale_price_range = fields.Boolean(
        related="product_tmpl_id.use_sale_price_range",
        readonly=False,
    )
    min_sale_price = fields.Monetary(
        related="product_tmpl_id.min_sale_price",
        readonly=False,
    )
    max_sale_price = fields.Monetary(
        related="product_tmpl_id.max_sale_price",
        readonly=False,
    )
    use_variant_sale_price_range = fields.Boolean(
        string="Use Variant Sale Price Range",
        help="When enabled, this variant uses its own allowed unit price range instead of the product template range.",
    )
    variant_min_sale_price = fields.Monetary(
        string="Variant Minimum Sale Price",
        currency_field="currency_id",
        help="Lowest suggested unit price for this variant.",
    )
    variant_max_sale_price = fields.Monetary(
        string="Variant Maximum Sale Price",
        currency_field="currency_id",
        help="Highest suggested unit price for this variant.",
    )

    @api.onchange("use_variant_sale_price_range")
    def _onchange_use_variant_sale_price_range(self):
        for product in self:
            if (
                product.use_variant_sale_price_range
                and not product.variant_min_sale_price
                and not product.variant_max_sale_price
            ):
                product.variant_min_sale_price = product.lst_price
                product.variant_max_sale_price = product.lst_price

    @api.constrains(
        "use_variant_sale_price_range",
        "variant_min_sale_price",
        "variant_max_sale_price",
    )
    def _check_variant_sale_price_range(self):
        for product in self.filtered("use_variant_sale_price_range"):
            if product.currency_id.compare_amounts(
                product.variant_min_sale_price,
                product.variant_max_sale_price,
            ) > 0:
                raise ValidationError(
                    _(
                        "The variant minimum sale price cannot be greater than the variant maximum sale price for %(product)s.",
                        product=product.display_name,
                    )
                )

    def _get_sale_price_range_data(self, currency=None, company=None, date=None):
        self.ensure_one()
        company = company or self.env.company
        currency = currency or company.currency_id
        conversion_date = fields.Date.to_date(date) or fields.Date.context_today(self)

        if self.use_variant_sale_price_range:
            product_currency = self.currency_id or company.currency_id
            return {
                "has_sale_price_range": True,
                "allowed_min_sale_price": product_currency._convert(
                    self.variant_min_sale_price,
                    currency,
                    company,
                    conversion_date,
                ),
                "allowed_max_sale_price": product_currency._convert(
                    self.variant_max_sale_price,
                    currency,
                    company,
                    conversion_date,
                ),
                "show_sale_price_range_in_configurator": self.product_tmpl_id._show_sale_price_range_in_configurator(),
            }

        return self.product_tmpl_id._get_sale_price_range_data(
            currency=currency,
            company=company,
            date=conversion_date,
        )
