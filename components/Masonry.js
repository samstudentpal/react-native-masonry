import { View, FlatList, Image, Text, Dimensions } from 'react-native';
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Task from 'data.task';
import isEqual from 'lodash.isequal';
import differenceBy from 'lodash.differenceby';

import { resolveImage } from './model';
import Column from './Column';
import styles from '../styles/main';

// assignObjectColumn :: Number -> [Objects] -> [Objects]
export const assignObjectColumn = (nColumns, index, targetObject) => ({...targetObject, ...{ column: index % nColumns }});

// assignObjectIndex :: (Number, Object) -> Object
// Assigns an `index` property` from bricks={data}` for later sorting.
export const assignObjectIndex = (index, targetObject) => ({...targetObject, ...{ index }});

// containMatchingUris :: ([brick], [brick]) -> Bool
const containMatchingUris = (r1, r2) => isEqual(r1.map(brick => brick.uri), r2.map(brick => brick.uri));

export default class Masonry extends Component {
  static propTypes = {
    bricks: PropTypes.array,
    columns: PropTypes.number,
    sorted: PropTypes.bool,
    imageContainerStyle: PropTypes.object,
    customImageComponent: PropTypes.func,
    customImageProps: PropTypes.object,
    spacing: PropTypes.number
  };

  static defaultProps = {
    bricks: [],
    columns: 2,
    sorted: false,
    imageContainerStyle: {},
    spacing: 1
  };

  constructor(props) {
    super(props);

    this.state = {
      dataSource: [],
      dimensions: {},
      initialOrientation: true,
      _sortedData: [],
      _resolvedData: []
    };

    this.offset = 0
    // Assuming that rotation is binary (vertical|landscape)
    Dimensions.addEventListener('change', (window) => this.setState(state => ({ initialOrientation: !state.initialOrientation })))
  }

  componentDidMount() {
    this.resolveBricks(this.props);
  }

  componentWillReceiveProps(nextProps) {
    const sameData = containMatchingUris(this.props.bricks, nextProps.bricks);
    if (sameData) {
      const differentColumns = this.props.columns !== nextProps.columns;

      if (differentColumns) {
        const newColumnCount = nextProps.columns;
        // Re-sort existing data instead of attempting to re-resolved
        const resortedData = this.state._resolvedData
          .map((brick, index) => assignObjectColumn(newColumnCount, index, brick))
          .map((brick, index) => assignObjectIndex(index, brick))
          .reduce((sortDataAcc, resolvedBrick) => _insertIntoColumn(resolvedBrick, sortDataAcc, this.props.sorted), []);

        this.setState({
          dataSource: resortedData
        });
      }
    } else {
    this.resolveBricks(nextProps, true);
    }
  }

  resolveBricks({ bricks, columns }, newBricks = false) {
    // Sort bricks and place them into their respectable columns
    const sortedBricks = bricks
      .map((brick, index) => assignObjectColumn(columns, index, brick))
      .map((brick, index) => assignObjectIndex(index, brick));

    // Do a difference check if these are new props
    // to only resolve what is needed
    const unresolvedBricks = (newBricks) ?
      differenceBy(sortedBricks, this.state._resolvedData, 'uri') :
      sortedBricks;

    unresolvedBricks
      .map(brick => resolveImage(brick))
      .map(resolveTask => resolveTask.fork(
        (err) => console.warn('Image failed to load'),
        (resolvedBrick) => {
          this.setState(state => {
            const sortedData = _insertIntoColumn(resolvedBrick, state._sortedData, this.props.sorted);

            return {
              dataSource: sortedData,
              _sortedData: sortedData,
              _resolvedData: [...state._resolvedData, resolvedBrick]
            };
          });;
        }));
  }

  _setParentDimensions(event) {
    // Currently height isn't being utilized, but will pass through for future features
    const {width, height} = event.nativeEvent.layout;

    this.setState({
      dimensions: {
        width,
        height
      }
    });
  }

  isCloseToBottom({layoutMeasurement, contentOffset, contentSize}) {
    if (contentOffset.y > this.offset) {
      this.offset = contentOffset.y;
      return layoutMeasurement.height + contentOffset.y >= contentSize.height;
    } else {
      this.offset = contentOffset.y;
      return false;
    }
  }

  render() {
    return (
      <View style={{flex: 1}} onLayout={(event) => this._setParentDimensions(event)}>
        <FlatList
          contentContainerStyle={styles.masonry__container}
          data={this.state.dataSource}
          keyExtractor={(item, index) => (`RN-MASONRY-COLUMN-${index}`)}
          onScroll={({nativeEvent}) => {
            if (this.isCloseToBottom(nativeEvent)) {
              this.props.onScrollToEnd && this.props.onScrollToEnd()
            }
          }}
          scrollEventThrottle={500}
          renderItem={({item, index}) =>
            <Column
              data={item}
              columns={this.props.columns}
              parentDimensions={this.state.dimensions}
              imageContainerStyle={this.props.imageContainerStyle}
              customImageComponent={this.props.customImageComponent}
              customImageProps={this.props.customImageProps}
              spacing={this.props.spacing}
            />
          }
        />
      </View>
    )
  }
};

// Returns a copy of the dataSet with resolvedBrick in correct place
// (resolvedBrick, dataSetA, bool) -> dataSetB
export function _insertIntoColumn (resolvedBrick, dataSet, sorted) {
  let dataCopy = dataSet.slice();
  const columnIndex = resolvedBrick.column;
  const column = dataSet[columnIndex];

  if (column) {
    // Append to existing "row"/"column"
    const bricks = [...column, resolvedBrick];
    if (sorted) {
      // Sort bricks according to the index of their original array position
      bricks = bricks.sort((a, b) => (a.index < b.index) ? -1 : 1);
    }
    dataCopy[columnIndex] = bricks;
  } else {
    // Pass it as a new "row" for the data source
    dataCopy = [...dataCopy, [resolvedBrick]];
  }

  return dataCopy;
};
