from odoo import _, api, fields, models
from odoo.exceptions import ValidationError


class ProductTemplate(models.Model):
    _inherit = "product.template"

    use_sale_price_range = fields.Boolean(
        string="Use Sale Price Range",
        help="When enabled, salespeople will see the allowed unit price range on sale order lines.",
    )
    min_sale_price = fields.Monetary(
        string="Minimum Sale Price",
        currency_field="currency_id",
        help="Lowest suggested unit price for this product.",
    )
    max_sale_price = fields.Monetary(
        string="Maximum Sale Price",
        currency_field="currency_id",
        help="Highest suggested unit price for this product.",
    )

    @api.onchange("use_sale_price_range")
    def _onchange_use_sale_price_range(self):
        for product in self:
            if (
                product.use_sale_price_range
                and not product.min_sale_price
                and not product.max_sale_price
            ):
                product.min_sale_price = product.list_price
                product.max_sale_price = product.list_price

    @api.constrains("use_sale_price_range", "min_sale_price", "max_sale_price")
    def _check_sale_price_range(self):
        for product in self.filtered("use_sale_price_range"):
            if product.currency_id.compare_amounts(product.min_sale_price, product.max_sale_price) > 0:
                raise ValidationError(
                    _(
                        "The minimum sale price cannot be greater than the maximum sale price for %(product)s.",
                        product=product.display_name,
                    )
                )

    def _get_sale_price_range_data(self, currency=None, company=None, date=None):
        self.ensure_one()
        company = company or self.env.company
        currency = currency or company.currency_id
        conversion_date = fields.Date.to_date(date) or fields.Date.context_today(self)

        if not self.use_sale_price_range:
            return {
                "has_sale_price_range": False,
            }

        product_currency = self.currency_id or company.currency_id
        return {
            "has_sale_price_range": True,
            "allowed_min_sale_price": product_currency._convert(
                self.min_sale_price,
                currency,
                company,
                conversion_date,
            ),
            "allowed_max_sale_price": product_currency._convert(
                self.max_sale_price,
                currency,
                company,
                conversion_date,
            ),
            "show_sale_price_range_in_configurator": self._show_sale_price_range_in_configurator(),
        }

    @api.model
    def _get_additional_configurator_data(
        self, product_or_template, date, currency, pricelist, *, uom=None, **kwargs
    ):
        values = super()._get_additional_configurator_data(
            product_or_template,
            date,
            currency,
            pricelist,
            uom=uom,
            **kwargs,
        )
        values.update(
            product_or_template._get_sale_price_range_data(
                currency=currency,
                company=self.env.company,
                date=date,
            )
        )
        return values

    def _show_sale_price_range_in_configurator(self):
        self.ensure_one()
        return bool(
            self.attribute_line_ids.filtered(
                lambda line: line.attribute_id.create_variant != "no_variant"
            )
        )
