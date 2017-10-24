/**
 * Bootstrap form module
 * @module express/front/form
 */

/**
 * Form helper
 */
export class Form {
    /**
     * Create a form
     */
    constructor() {
        this.data = { success: true, messages: {}, form: {} };
        this.timestamp = Date.now();
    }

    /**
     * Extract field values
     * @param {object} el                       jQuery element
     * @return {object}
     */
    static extract(el) {
        let result = {};
        el.find('[name]').each((index, item) => {
            let input = $(item);
            result[input.prop('name')] = input.val();
        });
        return result;
    }

    /**
     * Remove error messages
     * @param {object} el                       jQuery element
     * @param {object} [input]                  Reset this input or all inputs if not set
     */
    static reset(el, input) {
        el.find('.messages').empty().hide();
        if (input) {
            input.removeClass('is-invalid');
            input.parents('.form-group').find('.invalid-feedback').empty();
        } else {
            el.find('.form-control').removeClass('is-invalid');
            el.find('.invalid-feedback').empty();
        }
    }

    /**
     * Prevent user interaction
     * @param {object} el                       jQuery element
     */
    static lock(el) {
        el.find('.form-control').prop('disabled', true);
        el.find('[type="submit"]').prop('disabled', true);
    }

    /**
     * Allow user interaction
     * @param {object} el                       jQuery element
     */
    static unlock(el) {
        el.find('.form-control').prop('disabled', false);
        el.find('[type="submit"]').prop('disabled', false);
    }

    /**
     * Is the form locked
     * @param {object} el                       jQuery element
     */
    static isLocked(el) {
        return el.find('[type="submit"]').prop('disabled');
    }

    /**
     * Focus first available input
     * @param {object} el                       jQuery element
     */
    static focus(el) {
        el.find('[name]').each((index, item) => {
            let input = $(item);
            if (!input.prop('readonly') && !input.prop('disabled')) {
                input.focus();
                return false;
            }
        });
    }

    /**
     * Initialize Bootstrap dialog
     * @param {object} el                       jQuery element
     * @param {object} [submit]                 jQuery .ajax() params object for submission
     * @param {string} [submit.url]             URL to POST to, data will be auto assigned
     * @param {function} [submit.success]       Success handler
     * @param {object} [validate]               jQuery .ajax() params object for validation
     * @param {string} [validate.url]           URL to POST to, data will be auto assigned with _validate = true added
     * @param {function} [validate.success]     Success handler
     */
    init(el, submit, validate) {
        el.on('show.bs.modal', () => {
            this.constructor.reset(el);
            this.constructor.unlock(el);
        });
        el.on('shown.bs.modal', () => {
            this.constructor.focus(el);
        });

        el.find('[name]').on('input', event => {
            this.constructor.reset(el, $(event.target));
        });

        if (validate) {
            el.find('[validate]').on('focusout', event => {
                if (this.constructor.isLocked(el))
                    return;

                let success = validate.success;
                let params = Object.assign(
                    {
                        type: 'POST',
                        data: Object.assign({ _validate: true }, this.constructor.extract(el)),
                    },
                    validate,
                    {
                        success: data => {
                            if (!this.constructor.isLocked(el) && this.timestamp < timestamp) {
                                this.update(el, data, false);
                                this.checkField(el, $(event.target).prop('name'));
                                this.timestamp = timestamp;
                            }
                            if (success)
                                success(data);
                        }
                    }
                );

                let timestamp = Date.now();
                setTimeout(() => {
                    if (!this.constructor.isLocked(el) && this.timestamp < timestamp) {
                        this.constructor.reset(el, $(event.target));
                        $.ajax(validate.url, params);
                    }
                }, 250);
            });
        }

        if (submit) {
            el.find('[type="submit"]').on('click', () => {
                let timestamp = Date.now();

                let success = submit.success;
                let params = Object.assign(
                    {
                        type: 'POST',
                        data: this.constructor.extract(el),
                    },
                    submit,
                    {
                        success: data => {
                            this.constructor.reset(el);
                            if (!data.success) {
                                this.constructor.unlock(el);
                                if (this.timestamp <= timestamp) {
                                    this.update(el, data, true);
                                    this.checkForm(el);
                                }
                            }
                            if (success)
                                success(data);
                        },
                    }
                );

                $.ajax(submit.url, params);
                this.timestamp = timestamp;
                Form.lock(el);
            });
        }
    }

    /**
     * Update data
     * @param {object} el                       jQuery element
     * @param {object} data                     The data
     * @param {boolean} [updateValues=false]    Update field values
     */
    update(el, data, updateValues = false) {
        this.data = data;

        if (updateValues) {
            for (let field of Object.keys(this.data.form)) {
                let fieldEl = el.find(`[name="${field}"]`);
                fieldEl.val(this.data.form[field].value);
            }
        }
    }

    /**
     * Check field
     * @param {object} el                       jQuery element
     * @param {string} name                     Field name
     */
    checkField(el, name) {
        if (!this.data.form[name] || this.data.form[name].valid)
            return;

        let fieldEl = el.find(`[name="${name}"]`);
        fieldEl.addClass('is-invalid');

        let errorsEl = fieldEl.parents('.form-group').find('.invalid-feedback');
        for (let key of Object.keys(this.data.form[name].errors))
            errorsEl.append($('<div></div>').html(this.data.form[name].errors[key].message));
    }

    /**
     * Check form field errors, set focus to first error
     * @param {object} el                       jQuery element
     */
    checkForm(el) {
        let messagesEl = el.find('.messages');
        let hasMessages = false;
        for (let key of Object.keys(this.data.messages || {})) {
            hasMessages = true;
            let msg = this.data.messages[key];
            let msgEl = $(`<div class="alert ${msg.type === 'error' ? 'alert-danger' : 'alert-success'}"></div>`).html(msg.message);
            let colEl = $('<div class="col-sm-12"></div>').append(msgEl);
            let rowEl = $('<div class="row"></div>').append(colEl);
            messagesEl.append(rowEl);
        }
        if (hasMessages)
            messagesEl.show('slow');

        let first;
        let focused = false;
        for (let field of Object.keys(this.data.form) || {}) {
            let fieldEl = el.find(`[name="${field}"]`);
            if (!fieldEl.length)
                continue;

            if (!first && !fieldEl.prop('readonly') && !fieldEl.prop('disabled'))
                first = fieldEl;

            if (!this.data.form[field].valid) {
                fieldEl.addClass('is-invalid');

                let errorsEl = fieldEl.parents('.form-group').find('.invalid-feedback');
                for (let key of Object.keys(this.data.form[field].errors))
                    errorsEl.append($('<div></div>').html(this.data.form[field].errors[key].message));

                if (!focused && !fieldEl.prop('readonly') && !fieldEl.prop('disabled')) {
                    fieldEl.focus();
                    focused = true;
                }
            }
        }

        if (!focused && first)
            first.focus();
    }
}
