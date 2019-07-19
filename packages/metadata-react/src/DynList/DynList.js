/**
 *
 *
 * @module DynList
 *
 * Created by Evgeniy Malyarov on 27.03.2019.
 */

import React from 'react';
import PropTypes from 'prop-types';
import MDNRComponent from '../common/MDNRComponent';
import {withIface} from 'metadata-redux';
import ReactDataGrid from 'react-data-grid';
import LoadingMessage from '../DumbLoader/LoadingMessage';
import DataListToolbar from '../DataList/DataListToolbar';
import SchemeSettingsTabs from '../SchemeSettings/SchemeSettingsTabs';
import Confirm from '../App/Confirm';
import Helmet from 'react-helmet';

const LIMIT = 50;
const ROW_HEIGHT = 33;
//const OVERSCAN_ROW = 2;

class DynList extends MDNRComponent {

  constructor(props, context) {
    super(props, context);

    this.state = {
      selectedRow: null,
      scrollSetted: false,
      rowCount: 0,
      settings_open: false,
      network_error: '',
      no_rows: false,
      ref: '',
      scheme: null,
      columns: [],
    };

    /** Set of grid rows. */
    this.rows = new Map();
    this.fakeRows = new Map();
    this.ranges = [];
  }

  componentDidMount() {
    super.componentDidMount();
    this.handleManagerChange(this.props);
  }

  // при изменении менеджера данных
  handleManagerChange({_mgr, _meta, _ref}) {

    const {class_name} = _mgr;

    this._meta = _meta || _mgr.metadata();

    const newState = {ref: _ref || '', scrollSetted: false};
    this.setState(newState);

    $p.cat.scheme_settings.get_scheme(class_name)
      .then(this.handleSchemeChange);

  }

  // при изменении настроек или варианта компоновки
  handleSchemeChange = (scheme) => {

    scheme && scheme.set_default();

    const {props: {handlers, _mgr}, _meta: {fields}, _mounted} = this;
    if(!_mounted) {
      return;
    }

    handlers.handleSchemeChange && handlers.handleSchemeChange(scheme);

    // пересчитываем и перерисовываем динсписок
    const columns = scheme.rx_columns({mode: 'ts', fields, _mgr});
    this.handleFilterChange(scheme, columns);
  };

  // при изменении параметров компоновки - схему не меняем, но выполняем пересчет
  handleFilterChange = (scheme, columns) => {

    const {state, props, rows, fakeRows, ranges} = this;

    if(!(scheme instanceof $p.CatScheme_settings)) {
      scheme = state.scheme;
    }

    if(!columns) {
      columns = state.columns;
    }

    rows.clear();
    fakeRows.clear();
    ranges.length = 0;

    this.onRowSelect({scheme, columns, rowCount: 0, selectedRow: null}, () => {
      this.loadMoreRows({
        startIndex: 0,
        stopIndex: LIMIT - 1,
      });
    });
  };

  loadMoreRows = ({startIndex, stopIndex}) => {
    const {props: {_mgr, _owner, find_rows}, state: {scheme, columns, ref, scrollSetted}, rows, fakeRows, ranges}  = this;

    if(startIndex < 0) {
      startIndex = 0;
    }
    if(stopIndex < startIndex) {
      stopIndex = startIndex;
    }
    let increment = stopIndex - startIndex;
    if(!increment && rows.get(startIndex)) {
      return;
    }

    const nrange = {startIndex, stopIndex};
    let merged;
    for(const range of ranges) {
      // если запрашиваемый диапазон внутри полученного ранее - выходим
      if(range.stopIndex >= nrange.stopIndex && range.startIndex <= nrange.startIndex) {
        return;
      }
      if(range.stopIndex >= nrange.startIndex && range.stopIndex <= nrange.stopIndex) {
        range.stopIndex = Math.max(range.stopIndex, nrange.stopIndex);
        merged = true;
      }
      if(range.startIndex <= nrange.stopIndex && range.startIndex >= nrange.startIndex) {
        range.startIndex = Math.min(range.startIndex, nrange.startIndex);
        merged = true;
      }
    }
    if(!merged) {
      ranges.push(nrange);
    }

    for(let j = startIndex; j < stopIndex; j++) {
      fakeRows.set(j, {});
    }

    return Promise.resolve().then(() => {
      const newState = {no_rows: false, network_error: null};
      if(scrollSetted) {
        newState.scrollSetted = false;
        newState.ref = '';
      }
      this.setState(newState);

      // в зависимости от типа кеширования...
      if(/ram$/.test(_mgr.cachable)) {
        // фильтруем в озу
        const selector = _mgr.get_search_selector({
          _obj: _owner ? (_owner._obj || _owner.props && _owner.props._obj) : null,
          _meta: _owner ? _owner._meta : {},
          search: scheme._search,
          skip: startIndex,
          top: increment + 1,
          sorting: scheme.sorting,
        });
        if(selector.top < LIMIT / 2) {
          selector.top = LIMIT / 2;
        }
        return Promise.resolve($p.utils._find_rows_with_sort.call(_mgr, _mgr.alatable, selector))
          .then(({docs, count}) => {
            for(let j = startIndex; j <= stopIndex; j++) {
              fakeRows.delete(j);
            }
            this.updateList(docs, startIndex, count);
          });
      }
      else {
        // выполняем запрос
        const sprm = {
          columns,
          skip: startIndex,
          limit: increment + 1,
        };
        if(sprm.limit < LIMIT / 2) {
          sprm.limit = LIMIT / 2;
        }
        const selector = _mgr.mango_selector ? _mgr.mango_selector(scheme, sprm) : scheme.mango_selector(sprm);
        // если указано начальное значение списка, первый запрос делаем со ссылкой
        if(ref && !scrollSetted) {
          selector.ref = ref;
        }
        selector._raw = true;

        return (find_rows ? find_rows(selector, scheme) : this.fromIndexer(selector))
          .then((data) => {

            if(!this._mounted) return;

            for(let j = startIndex; j <= stopIndex; j++) {
              fakeRows.delete(j);
            }

            if(Array.isArray(data)) {
              this.updateList(data, startIndex);
            }
            else {
              const {docs, scroll, flag, count} = data;
              this.updateList(docs, startIndex, count);
              if(ref && !scrollSetted) {
                const newState = {
                  scrollSetted: true,
                  ref: '',
                }
                this.setState(newState, () => {
                  //selectRow
                  this.grid.openCellEditor(scroll, 0);
                });
              }
            }
          })
          .catch((err) => {
            this.setState({network_error: err});
            if(this._mounted) {
              this._timer = setTimeout(this.handleFilterChange, 2600);
            }
          });
      }
    });
  };

  // помещает свежую порцию данных в grid
  updateList = (data, startIndex, rowCount) => {
    const {rows} = this;

    // обновляем массив результата
    for (let i = 0; i < data.length; i++) {
      // Append one because first row is header.
      rows.set(i + startIndex, data[i]);
    }
    // Обновить количество записей.
    if(this._mounted) {
      if(rowCount === undefined) {
        rowCount = rows.size;
      }
      const newState = {
        no_rows: !rowCount,
        rowCount,
      };
      this.setState(newState);
    }
  };

  // получает набор банных из индексера либо спрашивает у менеджера, если оффлайн
  fromIndexer(selector) {
    const {props: {_mgr, indexer}, state: {scheme}}  = this;
    if(!navigator.onLine || !scheme || !indexer) {
      return _mgr.find_rows_remote(selector);
    }

    const {remote: {doc}, props: {_suffix}} = $p.adapters.pouch;
    const {username, password} = doc.__opts.auth;

    scheme.append_selection(selector);

    const opts = {
      method: 'post',
      credentials: 'include',
      headers: {
        Authorization: `Basic ${btoa(unescape(encodeURIComponent(username + ':' + password)))}`,
        suffix: _suffix || '0'
      },
      body: JSON.stringify(selector)
    };

    return fetch('/r/_find', opts)
      .then((res) => {
        if(res.status <= 201) {
          return res.json();
        }
        else {
          return res.text()
            .then((text) => {
              throw new Error(`${res.statusText}: ${text}`);
            });
        }
      })
      .then((data) => {
        data.docs.forEach((doc) => {
          if(!doc.ref) {
            doc.ref = doc._id.split('|')[1];
            delete doc._id;
          }
        });
        return data;
      });
  }

  // получает строку по индексу
  rowGetter = (i) => {
    if(i < 0) {
      return undefined;
    }
    const {rows}  = this;
    const row = rows.get(i);
    if(!row) {
      const {fakeRows, ranges, state: {rowCount}}  = this;
      // todo: если i > диапазона, читаем вперёд, иначе - назад
      if(!fakeRows.get(i)) {
        if(rowCount && i > rowCount - (LIMIT / 2)) {
          this.loadMoreRows({
            startIndex: rowCount - LIMIT,
            stopIndex: rowCount + 1,
          });
        }
        else {
          // ищем ближайший диапазон
          let dist = Infinity;
          let crange;
          for(const range of ranges) {
            const cdist = Math.min(Math.abs(range.startIndex - i), Math.abs(range.stopIndex - i));
            if(cdist < dist) {
              crange = range;
              dist = cdist;
            }
          }
          // определяем направление
          if(crange && i <= crange.startIndex) {
            let lim = crange.startIndex - i;
            if(lim < LIMIT) {
              this.loadMoreRows({
                startIndex: crange.startIndex - LIMIT,
                stopIndex: crange.startIndex,
              });
            }
            else {
              this.loadMoreRows({
                startIndex: i - LIMIT / 2,
                stopIndex: i + LIMIT / 2 + 1,
              });
            }
          }
          else if(crange && i >= crange.stopIndex) {
            let lim = i - crange.stopIndex;
            if(lim < LIMIT) {
              this.loadMoreRows({
                startIndex: crange.stopIndex,
                stopIndex: crange.stopIndex + LIMIT,
              });
            }
            else {
              this.loadMoreRows({
                startIndex: i - LIMIT / 2,
                stopIndex: i + LIMIT / 2,
              });
            }
          }
          else {
            this.loadMoreRows({
              startIndex: i,
              stopIndex: i + LIMIT,
            });
          }
        }
      }

      return fakeRows.get(i);
    }
    return row;
  };

  // открывает панель настроек схемы
  handleSettingsOpen = () => {
    this.setState({settings_open: true});
  };

  // прячет панель настроек схемы
  handleSettingsClose = () => {
    this.setState({settings_open: false});
  };

  // показывает-скрывает диалог предупреждения о закрытии
  handleConfirmClose = () => {
    this.setState({confirm_text: ''});
  };

  // показывает-скрывает диалог информации
  handleInfoText = (info_text) => {
    if(typeof info_text !== 'string') {
      info_text = '';
    }
    this.setState({info_text});
  }

  // возвращает текущую строку динсписка
  get selectedRow() {
    const {state: {selectedRow}, rows} = this;
    return typeof selectedRow === 'number' ? rows.get(selectedRow) : selectedRow;
  }

  // обработчик выбора значения в списке
  handleSelect = () => {
    const {selectedRow: row, props: {handlers, _mgr}} = this;
    if(row) {
      handlers.handleSelect && handlers.handleSelect(row, _mgr);
    }
    else {
      this.handleInfoText('Не выбрана строка');
    }
  };

  // обработчик добавления элемента списка
  handleAdd = (event) => {
    const {handlers, _mgr} = this.props;
    handlers.handleAdd && handlers.handleAdd(_mgr, event);
  };

  // обработчик редактирования элемента списка
  handleEdit = () => {
    const {_meta, selectedRow: row, props: {handlers, _mgr}} = this;
    if(!row || $p.utils.is_empty_guid(row.ref)) {
      handlers.handleIfaceState({
        component: '',
        name: 'alert',
        value: {open: true, text: 'Укажите строку для редактирования', title: _meta.synonym}
      });
    }
    else if(handlers.handleEdit) {
      handlers.handleEdit({row, ref: row.ref, _mgr});
    }
  };

  // обработчик удаления элемента списка
  handleRemove = () => {
    const {_meta, selectedRow: row, props: {handlers, _mgr}} = this;

    if(!row || $p.utils.is_empty_guid(row.ref)) {
      handlers.handleIfaceState({
        component: '',
        name: 'alert',
        value: {open: true, text: 'Укажите строку для удаления', title: _meta.synonym}
      });
    }
    else if(handlers.handleMarkDeleted) {
      this._handleRemove = () => {
        this.setState({confirm_text: ''}, () => {
          Promise.resolve()
            .then(() => handlers.handleMarkDeleted({row, ref: row.ref, _mgr}))
            .then(this.handleFilterChange)
            .catch((err) => this.setState({network_error: err}));
        });
      };
      this.setState({confirm_text: 'Удалить объект?'});
    }
  };

  // обработчик печати теущей строки
  handlePrint = (model) => {
    const {selectedRow: row, props: {_mgr}} = this;
    row && _mgr.print(row.ref, model);
  };

  // обработчик вложений теущей строки
  handleAttachments = () => {
    const {selectedRow: row, props: {handlers, _mgr}} = this;
    row && handlers.handleAttachments && handlers.handleAttachments(row, _mgr);
  };

  get ltitle() {
    const {_mgr} = this.props;
    return `${_mgr.metadata().list_presentation || _mgr.metadata().synonym} (список)`;
  }

  onRowSelect(newState, fn) {
    this.setState(newState, fn);
    this.props.onRowSelect && this.props.onRowSelect(newState);
  }

  render() {

    const {state, props, context, sizes, handleFilterChange, handleSchemeChange} = this;
    const {columns, scheme, confirm_text, info_text, settings_open, rowCount} = state;
    const {_mgr: {RepParams}, classes, title, registerFilterChange, width, height, GridRenderer, rowHeight, ...others} = props;

    if(!scheme) {
      return <LoadingMessage text="Чтение настроек компоновки..."/>;
    }
    else if(!columns || !columns.length) {
      return <LoadingMessage text="Ошибка настроек компоновки..."/>;
    }

    registerFilterChange && registerFilterChange(handleFilterChange);

    const show_grid = !settings_open || sizes.height > 572;

    const toolbar_props = {
      scheme,
      ...others,
      settings_open,
      handleSelect: this.handleSelect,
      handleAdd: this.handleAdd,
      handleEdit: this.handleEdit,
      handleRemove: this.handleRemove,
      handlePrint: this.handlePrint,
      //handleAttachments: this.handleAttachments,
      handleSettingsOpen: this.handleSettingsOpen,
      handleSettingsClose: this.handleSettingsClose,
      handleSchemeChange,
      handleFilterChange,
    };

    const sorting = scheme.first_sorting();

    return [

      !context.dnr && <Helmet key="helmet" title={title}>
        <meta name="description" content="Форма списка" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content="Форма списка" />
      </Helmet>,

      // диалог предупреждений при удалении
      confirm_text && <Confirm
        key="confirm"
        title={this._meta.synonym}
        text={confirm_text}
        handleOk={this._handleRemove}
        handleCancel={this.handleConfirmClose}
        open
      />,

      // диалог информации
      info_text && <Confirm
        key="info"
        title={this._meta.synonym}
        text={info_text}
        handleOk={this.handleInfoText}
        handleCancel={this.handleInfoText}
        open
      />,

      // панель инструментов табчасти
      <DataListToolbar key="toolbar" {...toolbar_props} />,

      // панель настроек компоновки
      settings_open && <SchemeSettingsTabs
        key="settings"
        height={show_grid ? 272 : (sizes.height || 500) - 104}
        scheme={scheme}
        tabParams={RepParams && <RepParams scheme={scheme} handleFilterChange={handleFilterChange}/>}
        handleSchemeChange={handleSchemeChange}
      />,

      <ReactDataGrid
        key="grid"
        ref={(el) => this.grid = el}
        rowHeight={ROW_HEIGHT}
        minHeight={sizes.height - 50 - (settings_open ? 320 : 0)}
        cellNavigationMode="changeRow"
        columns={columns}
        rowGetter={this.rowGetter}
        rowsCount={rowCount}
        onCellDeSelected={() => this.onRowSelect({selectedRow: null})}
        onCellSelected={(v) => this.onRowSelect({selectedRow: this.rows.get(v.rowIdx) || v.rowIdx})}
        onRowDoubleClick={props.selectionMode ? this.handleSelect : this.handleEdit}
        onGridSort={(sortColumn, sortDirection) => {
          scheme.first_sorting(sortColumn, sortDirection);
          this.handleFilterChange();
        }}
      />
    ];
  }

};

DynList.propTypes = {

  // данные
  _mgr: PropTypes.object.isRequired,    // Менеджер данных
  _acl: PropTypes.string,               // Права на чтение-изменение
  _meta: PropTypes.object,              // Описание метаданных. Если не указано, используем метаданные менеджера
  _ref: PropTypes.string,               // Ссылка, на которую надо спозиционироваться

  _owner: PropTypes.object,             // Поле - владелец. У него должны быть _obj, _fld и _meta
                                        // а внутри _meta могут быть choice_params и choice_links

  // настройки внешнего вида и поведения
  selectionMode: PropTypes.bool,        // Режим выбора из списка. Если истина - дополнительно рисуем кнопку выбора
  read_only: PropTypes.bool,            // Элемент только для чтения
  denyAddDel: PropTypes.bool,           // Запрет добавления и удаления строк (скрывает кнопки в панели, отключает обработчики)
  show_search: PropTypes.bool,          // Показывать поле поиска
  show_variants: PropTypes.bool,        // Показывать список вариантов настройки динсписка
  modal: PropTypes.bool,                // Показывать список в модальном диалоге

  // Redux actions
  handlers: PropTypes.object.isRequired, // обработчики редактирования объекта

};

DynList.defaultProps = {
  denyAddDel: false,
  read_only: false,
  minHeight: 220,
};

DynList.contextTypes = {
  dnr: PropTypes.object
};

export default withIface(DynList);
