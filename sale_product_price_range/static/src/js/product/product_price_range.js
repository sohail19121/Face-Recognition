import { Product } from "@sale/js/product/product";
import { ProductConfiguratorDialog } from "@sale/js/product_configurator_dialog/product_configurator_dialog";
import { useState, useSubEnv } from "@odoo/owl";
import { formatCurrency } from "@web/core/currency";
import { _t } from "@web/core/l10n/translation";
import { patch } from "@web/core/utils/patch";

const RANGE_EPSILON = 0.00001;
const normalizeSearch = (value) => (value || "").trim().toLowerCase();
const formatSearchText = (value) => (value || "").replace(/\s+/g, " ").trim();
const matchesVariantSearch = (attributeLine, attributeValue, query) => {
    const searchableText = [
        attributeLine.attribute?.name,
        attributeValue.name,
    ]
        .filter(Boolean)
        .join(" ");
    return normalizeSearch(searchableText).includes(query);
};

patch(Product, {
    props: {
        ...Product.props,
        has_sale_price_range: { type: Boolean, optional: true },
        allowed_min_sale_price: { type: Number, optional: true },
        allowed_max_sale_price: { type: Number, optional: true },
        show_sale_price_range_in_configurator: { type: Boolean, optional: true },
    },
});

patch(Product.prototype, {
    get showSalePriceRangeInConfigurator() {
        return !!(
            this.props.show_sale_price_range_in_configurator && this.props.has_sale_price_range
        );
    },

    get formattedAllowedSalePriceRange() {
        if (!this.showSalePriceRangeInConfigurator) {
            return "";
        }
        const minPrice = this.props.allowed_min_sale_price || 0;
        const maxPrice = this.props.allowed_max_sale_price || 0;
        const formattedMin = formatCurrency(minPrice, this.env.currency.id);
        const formattedMax = formatCurrency(maxPrice, this.env.currency.id);
        if (Math.abs(maxPrice - minPrice) <= RANGE_EPSILON) {
            return `${_t("Target price")}: ${formattedMin}`;
        }
        return `${formattedMin} - ${formattedMax}`;
    },

    get salePriceRangeStatus() {
        if (!this.showSalePriceRangeInConfigurator) {
            return "no_range";
        }
        const currentPrice = this.props.price || 0;
        if (currentPrice + RANGE_EPSILON < this.props.allowed_min_sale_price) {
            return "below_min";
        }
        if (currentPrice - RANGE_EPSILON > this.props.allowed_max_sale_price) {
            return "above_max";
        }
        return "in_range";
    },

    get salePriceRangeStatusLabel() {
        switch (this.salePriceRangeStatus) {
            case "below_min":
                return _t("Below Minimum");
            case "above_max":
                return _t("Above Maximum");
            case "in_range":
                return _t("Within Range");
            default:
                return "";
        }
    },

    get filteredAttributeLines() {
        const query = normalizeSearch(this.env.variantSearch?.query);
        const attributeLines = Array.isArray(this.props.attribute_lines)
            ? this.props.attribute_lines
            : [];
        if (!query) {
            return attributeLines;
        }

        return attributeLines.map((attributeLine) => {
            const attributeValues = Array.isArray(attributeLine.attribute_values)
                ? attributeLine.attribute_values
                : [];
            if (attributeValues.length <= 1) {
                return attributeLine;
            }

            const selectedValueIds = new Set(attributeLine.selected_attribute_value_ids || []);
            const matchingValues = attributeValues.filter(
                (attributeValue) =>
                    selectedValueIds.has(attributeValue.id)
            || matchesVariantSearch(attributeLine, attributeValue, query)
            );
            return matchingValues.length
                ? { ...attributeLine, attribute_values: matchingValues }
                : attributeLine;
        });
    },
});

patch(ProductConfiguratorDialog.prototype, {
    setup() {
        super.setup(...arguments);

        this.variantSearch = useState({ query: "" });
        useSubEnv({
            variantSearch: this.variantSearch,
        });
    },

    get showVariantSearch() {
        return [...this.state.products, ...this.state.optionalProducts].some((product) =>
            (product.attribute_lines || []).some(
                (attributeLine) => (attributeLine.attribute_values || []).length > 1
            )
        );
    },

    get variantSearchQuery() {
        return this.variantSearch.query;
    },

    get variantSearchSuggestions() {
        const query = normalizeSearch(this.variantSearch.query);
        if (!query) {
            return [];
        }

        const optionalProductIds = new Set(
            (this.state.optionalProducts || []).map((product) => product.product_tmpl_id)
        );

        const suggestions = [];
        for (const product of [...this.state.products, ...this.state.optionalProducts]) {
            const attributeLines = Array.isArray(product.attribute_lines)
                ? product.attribute_lines
                : [];
            for (const attributeLine of attributeLines) {
                const attribute = attributeLine.attribute || {};
                const attributeValues = Array.isArray(attributeLine.attribute_values)
                    ? attributeLine.attribute_values
                    : [];
                const canSuggestValues =
                    (this.env.canChangeVariant || attributeLine.create_variant === "no_variant")
                    && (attributeValues.length > 1 || attribute.display_type === "multi");
                if (!canSuggestValues) {
                    continue;
                }

                for (const attributeValue of attributeValues) {
                    if (attributeValue.excluded) {
                        continue;
                    }

                    if (!matchesVariantSearch(attributeLine, attributeValue, query)) {
                        continue;
                    }

                    const attributeName = formatSearchText(attribute.name);
                    const attributeValueName = formatSearchText(attributeValue.name);
                    if (!attributeValueName) {
                        continue;
                    }

                    const productName = formatSearchText(product.display_name);
                    suggestions.push({
                        key: `${product.product_tmpl_id}-${attributeLine.id}-${attributeValue.id}`,
                        productTmplId: product.product_tmpl_id,
                        ptalId: attributeLine.id,
                        ptavId: attributeValue.id,
                        attributeName,
                        attributeValueName,
                        productName,
                        secondaryLabel: [attributeName, productName].filter(Boolean).join(" - "),
                        searchValue: [attributeName, attributeValueName].filter(Boolean).join(" "),
                        isMulti: attribute.display_type === "multi",
                        isOptional: optionalProductIds.has(product.product_tmpl_id),
                        isSelected: (attributeLine.selected_attribute_value_ids || []).includes(
                            attributeValue.id
                        ),
                    });
                }
            }
        }

        return suggestions
            .sort((left, right) => {
                const leftRank = [
                    left.attributeValueName,
                    left.attributeName,
                ].some((text) => normalizeSearch(text).startsWith(query)) ? 0 : 1;
                const rightRank = [
                    right.attributeValueName,
                    right.attributeName,
                ].some((text) => normalizeSearch(text).startsWith(query)) ? 0 : 1;
                if (leftRank !== rightRank) {
                    return leftRank - rightRank;
                }
                const attributeCompare = left.attributeName.localeCompare(right.attributeName);
                if (attributeCompare !== 0) {
                    return attributeCompare;
                }
                const valueCompare = left.attributeValueName.localeCompare(
                    right.attributeValueName
                );
                if (valueCompare !== 0) {
                    return valueCompare;
                }
                return left.productName.localeCompare(right.productName);
            })
            .slice(0, 8);
    },

    onVariantSearchInput(event) {
        this.variantSearch.query = event.target.value;
    },

    async onVariantSearchSuggestionClick(suggestion) {
        this.variantSearch.query = suggestion.searchValue;
        if (suggestion.isSelected && !suggestion.isMulti) {
            return;
        }
        await this.env.updateProductTemplateSelectedPTAV(
            suggestion.productTmplId,
            suggestion.ptalId,
            suggestion.ptavId,
            suggestion.isMulti
        );
    },

    clearVariantSearch() {
        this.variantSearch.query = "";
    },
});
