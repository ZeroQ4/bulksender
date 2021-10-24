import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { account } from '@senswap/sen-js'
import { useUI } from 'senhub/providers'

import { Row, Col, Button, Typography, Space } from 'antd'
import IonIcon from 'components/ionicon'

import configs from 'configs'
import { AppState } from 'app/model'
import { explorer, toBigInt } from 'helpers/util'
import { TransferData, setData } from 'app/model/main.controller'
import Bulksender from 'app/lib'

const {
  sol: { spltAddress, splataAddress, bulksenderAddress, node },
} = configs

const Action = () => {
  const dispatch = useDispatch()
  const [loading, setLoading] = useState(false)
  const [bulk, setBulk] = useState<Array<TransferData>>([])
  const { data, mintAddress } = useSelector((state: AppState) => state.main)
  const { notify } = useUI()

  // Need to merge
  const duplicated = useMemo(() => {
    if (!data || !data.length) return false
    const duplicatedElements = data.filter(([address], index) => {
      const expectedIndex = data.findIndex(
        ([expectedAddress]) => address === expectedAddress,
      )
      return expectedIndex !== index && expectedIndex > -1
    })
    if (duplicatedElements.length > 0) return true
    return false
  }, [data])
  // No error
  const error = useMemo(() => {
    if (!data || !data.length) return true
    if (!account.isAddress(mintAddress)) return true
    const failedElements = data.filter(([address, amount]) => {
      if (!account.isAddress(address)) return true
      if (!toBigInt(amount)) return true
      return false
    })
    if (failedElements.length > 0) return true
    return false
  }, [data, mintAddress])
  // Merge duplicated addresses (must call when no error)
  const merge = useCallback(async () => {
    const nextData = [] as TransferData
    for (const [address, amount] of data) {
      const index = nextData.findIndex(([addr]) => addr === address)
      if (index >= 0) {
        nextData[index][1] = (
          toBigInt(nextData[index][1]) + toBigInt(amount)
        ).toString()
      } else {
        nextData.push([address, amount])
      }
    }
    await dispatch(setData(nextData))
  }, [data, dispatch])
  // Send a bulk
  const send = useCallback(async () => {
    await setLoading(true)
    const bulksender = new Bulksender(
      bulksenderAddress,
      spltAddress,
      splataAddress,
      node,
    )
    const {
      senos: { wallet },
    } = window
    for (const transferData of bulk) {
      try {
        const { txId } = await bulksender.checkedBulkTransfer(
          transferData.map(([_, amount]) => toBigInt(amount)),
          transferData.map(([address, _]) => address),
          mintAddress,
          wallet,
        )
        await notify({
          type: 'success',
          description: 'Successfully transfer tokens. Click to view details.',
          onClick: () => window.open(explorer(txId), '_blank'),
        })
        console.log(txId)
      } catch (er) {
        await notify({ type: 'error', description: (er as any).message })
      }
    }
    await setLoading(false)
  }, [bulk, mintAddress])
  // Compute bulk
  const computeBulk = useCallback(async () => {
    if (error) return setBulk([])
    await setLoading(true)
    const bulksender = new Bulksender(
      bulksenderAddress,
      spltAddress,
      splataAddress,
      node,
    )
    const {
      senos: { wallet },
    } = window
    let currentData = [...data]
    const newBulk: Array<TransferData> = [[]]
    while (currentData.length) {
      const [address, amount] = currentData.shift() as [string, string]
      const currentBulk = newBulk[newBulk.length - 1]
      const simulatedBulk = [...currentBulk, [address, amount]] as TransferData
      const ok = await bulksender.simulateBulkTransfer(
        simulatedBulk.map(([_, amount]) => toBigInt(amount)),
        simulatedBulk.map(([address, _]) => address),
        mintAddress,
        wallet,
      )
      if (ok) newBulk[newBulk.length - 1] = simulatedBulk
      else newBulk.push([[address, amount]])
    }
    await setBulk(newBulk)
    return setLoading(false)
  }, [error, data, mintAddress])

  useEffect(() => {
    computeBulk()
  }, [computeBulk])

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Space>
          <IonIcon name="information-circle-outline" />
          <Typography.Text type={bulk.length ? undefined : 'secondary'}>
            To send tokens to <strong>{data.length}</strong> address(es), you
            will need to sign <strong>{bulk.length}</strong> time(s).
          </Typography.Text>
        </Space>
      </Col>
      <Col span={12}>
        <Button
          type="text"
          icon={<IonIcon name="git-merge-outline" />}
          onClick={merge}
          disabled={loading || error || !duplicated}
          block
        >
          Merge
        </Button>
      </Col>
      <Col span={12}>
        <Button
          type="primary"
          icon={<IonIcon name="send" />}
          onClick={send}
          // disabled={error}
          loading={loading}
          block
        >
          Send
        </Button>
      </Col>
    </Row>
  )
}

export default Action
